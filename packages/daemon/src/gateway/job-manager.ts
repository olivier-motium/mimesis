/**
 * Job Manager - Queue, concurrency control, and lifecycle management.
 *
 * Manages the pool of running headless Claude jobs with:
 * - Global concurrency limit (3 jobs)
 * - Per-project limit (1 job per project)
 * - Queue for pending jobs
 * - Crash recovery for stale jobs
 */

import { JobRunner, type JobRequest, type JobResult } from "./job-runner.js";
import { JobRepo } from "../fleet-db/job-repo.js";
import { MAX_CONCURRENT_JOBS, MAX_JOBS_PER_PROJECT, JOB_STATUS } from "../config/index.js";
import type { StreamJsonChunk, JobStreamMessage, JobStartedMessage, JobCompletedMessage } from "./protocol.js";

export type JobEventListener = (event: JobStartedMessage | JobStreamMessage | JobCompletedMessage) => void;

interface RunningJob {
  jobId: number;
  projectId?: string;
  runner: JobRunner;
  listener: JobEventListener;
}

interface QueuedJob {
  request: JobRequest;
  listener: JobEventListener;
  resolve: (jobId: number) => void;
  reject: (error: Error) => void;
}

/**
 * Manages job execution with concurrency control.
 */
export class JobManager {
  private jobRepo: JobRepo;
  private running = new Map<number, RunningJob>();
  private queue: QueuedJob[] = [];
  private projectJobs = new Map<string, number>(); // projectId -> jobId

  constructor() {
    this.jobRepo = new JobRepo();
  }

  /**
   * Initialize and recover from crash (mark stale jobs as failed).
   */
  async initialize(): Promise<void> {
    const staleCount = this.jobRepo.recoverStaleRunning();
    if (staleCount > 0) {
      console.log(`[JOBS] Marked ${staleCount} stale jobs as failed`);
    }
  }

  /**
   * Create and queue a job.
   * Returns jobId when job starts (not when queued).
   */
  async createJob(request: JobRequest, listener: JobEventListener): Promise<number> {
    // Check per-project limit
    if (request.projectId && this.projectJobs.has(request.projectId)) {
      throw new Error(`Project ${request.projectId} already has a running job`);
    }

    // If under global limit, start immediately
    if (this.running.size < MAX_CONCURRENT_JOBS) {
      return this.startJob(request, listener);
    }

    // Queue the job
    return new Promise((resolve, reject) => {
      this.queue.push({ request, listener, resolve, reject });
      console.log(`[JOBS] Job queued (queue size: ${this.queue.length})`);
    });
  }

  /**
   * Cancel a job.
   */
  cancelJob(jobId: number): boolean {
    const job = this.running.get(jobId);
    if (!job) {
      // Can't cancel queued jobs yet
      return false;
    }

    job.runner.abort();
    this.jobRepo.markFailed(jobId, "Job was cancelled");

    // Notify listener
    job.listener({
      type: "job.completed",
      job_id: jobId,
      ok: false,
      error: "Job was cancelled",
    });

    this.removeRunningJob(jobId);
    this.processQueue();

    return true;
  }

  /**
   * Get running job count.
   */
  getRunningCount(): number {
    return this.running.size;
  }

  /**
   * Get queue size.
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Shutdown all jobs.
   */
  async shutdown(): Promise<void> {
    // Cancel all running jobs
    for (const [jobId, job] of this.running) {
      job.runner.abort();
      this.jobRepo.markFailed(jobId, "Server shutdown");
    }
    this.running.clear();
    this.projectJobs.clear();

    // Clear queue
    for (const queued of this.queue) {
      queued.reject(new Error("Server shutdown"));
    }
    this.queue = [];
  }

  /**
   * Start a job immediately.
   */
  private async startJob(request: JobRequest, listener: JobEventListener): Promise<number> {
    // Create job in database
    const jobId = this.jobRepo.create({
      type: request.type,
      model: request.model,
      request: {
        prompt: request.request.prompt,
        systemPrompt: request.request.systemPrompt,
      },
      projectId: request.projectId,
      repoRoot: request.repoRoot,
    });

    // Mark as started
    this.jobRepo.markStarted(jobId);

    // Track per-project
    if (request.projectId) {
      this.projectJobs.set(request.projectId, jobId);
    }

    // Notify listener
    listener({
      type: "job.started",
      job_id: jobId,
      project_id: request.projectId,
    });

    // Create runner
    const runner = new JobRunner();

    // Store running job
    const runningJob: RunningJob = {
      jobId,
      projectId: request.projectId,
      runner,
      listener,
    };
    this.running.set(jobId, runningJob);

    // Collect stream chunks for storage
    const streamChunks: StreamJsonChunk[] = [];

    // Run the job
    const onChunk = (chunk: StreamJsonChunk) => {
      streamChunks.push(chunk);

      // Forward to listener
      listener({
        type: "job.stream",
        job_id: jobId,
        chunk,
      });
    };

    // Execute asynchronously
    this.executeJob(jobId, request, runner, listener, streamChunks);

    return jobId;
  }

  /**
   * Execute job and handle completion.
   */
  private async executeJob(
    jobId: number,
    request: JobRequest,
    runner: JobRunner,
    listener: JobEventListener,
    streamChunks: StreamJsonChunk[]
  ): Promise<void> {
    try {
      const result = await runner.run(request, (chunk) => {
        streamChunks.push(chunk);
        listener({
          type: "job.stream",
          job_id: jobId,
          chunk,
        });
      });

      // Store stream chunks for replay
      this.jobRepo.appendStreamChunks(jobId, streamChunks);

      if (result.ok) {
        this.jobRepo.markCompleted(
          jobId,
          {
            success: true,
            output: result.text,
            structuredOutput: {
              thinking: result.thinking,
              toolUses: result.toolUses,
              usage: result.usage,
            },
          },
          streamChunks
        );

        listener({
          type: "job.completed",
          job_id: jobId,
          ok: true,
          result: {
            text: result.text,
            thinking: result.thinking,
            toolUses: result.toolUses,
          },
        });
      } else {
        this.jobRepo.markFailed(jobId, result.error ?? "Unknown error");

        listener({
          type: "job.completed",
          job_id: jobId,
          ok: false,
          error: result.error,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.jobRepo.markFailed(jobId, errorMessage);

      listener({
        type: "job.completed",
        job_id: jobId,
        ok: false,
        error: errorMessage,
      });
    } finally {
      this.removeRunningJob(jobId);
      this.processQueue();
    }
  }

  /**
   * Remove a job from running state.
   */
  private removeRunningJob(jobId: number): void {
    const job = this.running.get(jobId);
    if (job?.projectId) {
      this.projectJobs.delete(job.projectId);
    }
    this.running.delete(jobId);
  }

  /**
   * Process the queue and start waiting jobs.
   */
  private processQueue(): void {
    while (this.running.size < MAX_CONCURRENT_JOBS && this.queue.length > 0) {
      const queued = this.queue.shift();
      if (!queued) break;

      // Check per-project limit for queued job
      if (queued.request.projectId && this.projectJobs.has(queued.request.projectId)) {
        // Re-queue at the end
        this.queue.push(queued);
        continue;
      }

      // Start the job
      this.startJob(queued.request, queued.listener)
        .then(queued.resolve)
        .catch(queued.reject);
    }
  }
}
