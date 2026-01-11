/**
 * Repository for job persistence.
 * Manages headless job queue and Commander conversation history.
 */

import { eq, and, desc, sql, ne } from "drizzle-orm";
import { getFleetDb, schema } from "./index.js";
import type { Job, NewJob } from "./schema.js";
import { JOB_STATUS, JOB_TYPE, MODEL } from "../config/fleet.js";

export interface JobRequest {
  prompt: string;
  systemPrompt?: string;
  context?: Record<string, unknown>;
}

export interface JobResult {
  success: boolean;
  output?: string;
  structuredOutput?: Record<string, unknown>;
  error?: string;
}

export interface JobFilter {
  type?: string;
  status?: string;
  projectId?: string;
  model?: string;
  limit?: number;
  offset?: number;
}

/**
 * Repository for managing jobs in the Fleet database.
 */
export class JobRepo {
  /**
   * Get a job by ID.
   */
  get(jobId: number): Job | undefined {
    const db = getFleetDb();
    return db.select().from(schema.jobs).where(eq(schema.jobs.jobId, jobId)).get();
  }

  /**
   * Get jobs by status.
   */
  getByStatus(status: string, limit = 50): Job[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, status))
      .orderBy(desc(schema.jobs.tsCreated))
      .limit(limit)
      .all();
  }

  /**
   * Get queued jobs, ordered by creation time (oldest first).
   */
  getQueued(limit = 10): Job[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, JOB_STATUS.QUEUED))
      .orderBy(schema.jobs.tsCreated)
      .limit(limit)
      .all();
  }

  /**
   * Get running jobs.
   */
  getRunning(): Job[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, JOB_STATUS.RUNNING))
      .all();
  }

  /**
   * Get Commander conversation history (commander_turn jobs).
   * Returns completed jobs in chronological order.
   */
  getCommanderHistory(limit = 100): Job[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.type, JOB_TYPE.COMMANDER_TURN),
          eq(schema.jobs.status, JOB_STATUS.COMPLETED)
        )
      )
      .orderBy(schema.jobs.tsCreated)
      .limit(limit)
      .all();
  }

  /**
   * Query jobs with filters.
   */
  query(filter: JobFilter): Job[] {
    const db = getFleetDb();
    const conditions: ReturnType<typeof eq>[] = [];

    if (filter.type) {
      conditions.push(eq(schema.jobs.type, filter.type));
    }
    if (filter.status) {
      conditions.push(eq(schema.jobs.status, filter.status));
    }
    if (filter.projectId) {
      conditions.push(eq(schema.jobs.projectId, filter.projectId));
    }
    if (filter.model) {
      conditions.push(eq(schema.jobs.model, filter.model));
    }

    let query = db.select().from(schema.jobs).orderBy(desc(schema.jobs.tsCreated));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    if (filter.limit) {
      query = query.limit(filter.limit) as typeof query;
    }
    if (filter.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    return query.all();
  }

  /**
   * Create a new job.
   * Returns the job ID.
   */
  create(job: {
    type: string;
    model: string;
    request: JobRequest;
    projectId?: string;
    repoRoot?: string;
  }): number {
    const db = getFleetDb();
    const now = new Date().toISOString();

    const result = db
      .insert(schema.jobs)
      .values({
        tsCreated: now,
        type: job.type,
        projectId: job.projectId,
        repoRoot: job.repoRoot,
        model: job.model,
        status: JOB_STATUS.QUEUED,
        requestJson: JSON.stringify(job.request),
      })
      .run();

    return Number(result.lastInsertRowid);
  }

  /**
   * Create a Commander turn job.
   */
  createCommanderTurn(request: JobRequest): number {
    return this.create({
      type: JOB_TYPE.COMMANDER_TURN,
      model: MODEL.OPUS,
      request,
    });
  }

  /**
   * Create a worker task job.
   */
  createWorkerTask(
    request: JobRequest,
    projectId: string,
    repoRoot: string,
    model: string = MODEL.SONNET
  ): number {
    return this.create({
      type: JOB_TYPE.WORKER_TASK,
      model,
      request,
      projectId,
      repoRoot,
    });
  }

  /**
   * Mark a job as started.
   */
  markStarted(jobId: number): void {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.update(schema.jobs)
      .set({
        status: JOB_STATUS.RUNNING,
        tsStarted: now,
      })
      .where(eq(schema.jobs.jobId, jobId))
      .run();
  }

  /**
   * Mark a job as completed with result.
   */
  markCompleted(jobId: number, result: JobResult, streamChunks?: unknown[]): void {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.update(schema.jobs)
      .set({
        status: JOB_STATUS.COMPLETED,
        tsFinished: now,
        resultJson: JSON.stringify(result),
        streamChunksJson: streamChunks ? JSON.stringify(streamChunks) : null,
      })
      .where(eq(schema.jobs.jobId, jobId))
      .run();
  }

  /**
   * Mark a job as failed with error.
   */
  markFailed(jobId: number, error: string): void {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.update(schema.jobs)
      .set({
        status: JOB_STATUS.FAILED,
        tsFinished: now,
        error,
      })
      .where(eq(schema.jobs.jobId, jobId))
      .run();
  }

  /**
   * Mark a job as canceled.
   */
  markCanceled(jobId: number): void {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.update(schema.jobs)
      .set({
        status: JOB_STATUS.CANCELED,
        tsFinished: now,
      })
      .where(eq(schema.jobs.jobId, jobId))
      .run();
  }

  /**
   * Append stream chunks to a running job.
   * Used for incremental Commander history storage.
   */
  appendStreamChunks(jobId: number, chunks: unknown[]): void {
    const db = getFleetDb();
    const job = this.get(jobId);
    if (!job) return;

    const existingChunks = job.streamChunksJson
      ? (JSON.parse(job.streamChunksJson) as unknown[])
      : [];
    const allChunks = [...existingChunks, ...chunks];

    db.update(schema.jobs)
      .set({
        streamChunksJson: JSON.stringify(allChunks),
      })
      .where(eq(schema.jobs.jobId, jobId))
      .run();
  }

  /**
   * Count running jobs for a project.
   */
  countRunningForProject(projectId: string): number {
    const db = getFleetDb();
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.projectId, projectId),
          eq(schema.jobs.status, JOB_STATUS.RUNNING)
        )
      )
      .get();
    return result?.count ?? 0;
  }

  /**
   * Count total running jobs.
   */
  countRunning(): number {
    const db = getFleetDb();
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.jobs)
      .where(eq(schema.jobs.status, JOB_STATUS.RUNNING))
      .get();
    return result?.count ?? 0;
  }

  /**
   * Recover stale running jobs on startup.
   * Marks jobs that were running before crash as failed.
   */
  recoverStaleRunning(): number {
    const db = getFleetDb();
    const result = db
      .update(schema.jobs)
      .set({
        status: JOB_STATUS.FAILED,
        tsFinished: new Date().toISOString(),
        error: "Job interrupted by daemon restart",
      })
      .where(eq(schema.jobs.status, JOB_STATUS.RUNNING))
      .run();

    return result.changes;
  }

  /**
   * Delete old completed/failed/canceled jobs (cleanup).
   */
  cleanupOld(olderThanMs: number = 30 * 24 * 60 * 60 * 1000): number {
    const db = getFleetDb();
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();

    const result = db
      .delete(schema.jobs)
      .where(
        and(
          ne(schema.jobs.status, JOB_STATUS.QUEUED),
          ne(schema.jobs.status, JOB_STATUS.RUNNING),
          sql`${schema.jobs.tsCreated} < ${cutoff}`
        )
      )
      .run();

    return result.changes;
  }
}
