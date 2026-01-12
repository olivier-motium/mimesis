/**
 * Job Runner - Spawns headless Claude (-p) and streams output.
 *
 * Used for:
 * - Commander (Opus) cross-project queries
 * - Sonnet maintenance tasks (doc patches, skill updates)
 * - Haiku quick tasks
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { JOB_TIMEOUT_MS } from "../config/index.js";
import { getClaudePath } from "../utils/claude-path.js";
import { StreamParser, type StreamParserEvent } from "./stream-parser.js";
import type { StreamJsonChunk } from "./protocol.js";

export interface JobRequest {
  type: string;
  projectId?: string;
  repoRoot?: string;
  model: "opus" | "sonnet" | "haiku";
  request: {
    prompt: string;
    systemPrompt?: string;
    jsonSchema?: string;
    maxTurns?: number;
    disallowedTools?: string[];
  };
}

export interface JobResult {
  ok: boolean;
  text?: string;
  thinking?: string;
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export type StreamChunkCallback = (chunk: StreamJsonChunk) => void;

/**
 * Runs a single headless Claude job.
 */
export class JobRunner {
  private process: ChildProcess | null = null;
  private parser: StreamParser;
  private timeout: NodeJS.Timeout | null = null;
  private aborted = false;

  constructor() {
    this.parser = new StreamParser();
  }

  /**
   * Execute a job and stream chunks to callback.
   */
  async run(
    request: JobRequest,
    onChunk: StreamChunkCallback
  ): Promise<JobResult> {
    this.aborted = false;
    this.parser.reset();

    // Build claude command
    const args = this.buildArgs(request);
    const cwd = request.repoRoot || process.cwd();
    const claudePath = getClaudePath();

    console.log(`[JOB] Starting ${request.model} job in ${cwd}`);
    console.log(`[JOB] Using claude at: ${claudePath}`);
    console.log(`[JOB] Command: ${claudePath} ${args.join(" ")}`);

    return new Promise((resolve, reject) => {
      // Spawn claude process
      this.process = spawn(claudePath, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ANTHROPIC_MODEL: this.getModelId(request.model),
        },
      });

      // Set timeout
      this.timeout = setTimeout(() => {
        console.log(`[JOB] Timeout after ${JOB_TIMEOUT_MS}ms`);
        this.abort();
        resolve({
          ok: false,
          error: `Job timed out after ${JOB_TIMEOUT_MS / 1000}s`,
        });
      }, JOB_TIMEOUT_MS);

      // Stream stdout line by line
      const stdout = createInterface({
        input: this.process.stdout!,
        crlfDelay: Infinity,
      });

      const chunks: StreamJsonChunk[] = [];

      stdout.on("line", (line) => {
        if (this.aborted) return;

        try {
          const chunk: StreamJsonChunk = JSON.parse(line);
          chunks.push(chunk);
          onChunk(chunk);
          this.parser.parse(line);
        } catch {
          // Log non-JSON lines for debugging (truncate for safety)
          if (line.trim()) {
            console.log(`[JOB] Non-JSON output: ${line.slice(0, 200)}`);
          }
        }
      });

      // Capture stderr for errors (log in real-time for debugging)
      let stderr = "";
      this.process.stderr?.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        if (text.trim()) {
          console.log(`[JOB] stderr: ${text.trim().slice(0, 200)}`);
        }
      });

      // Handle process exit
      this.process.on("exit", (code, signal) => {
        this.clearTimeout();

        if (this.aborted) {
          resolve({
            ok: false,
            error: "Job was cancelled",
          });
          return;
        }

        if (code !== 0) {
          console.log(`[JOB] Process exited with code ${code}, signal ${signal}`);
          resolve({
            ok: false,
            error: stderr || `Process exited with code ${code}`,
          });
          return;
        }

        // Build result from accumulated state
        const result: JobResult = {
          ok: true,
          text: this.parser.getText(),
          thinking: this.parser.getThinking(),
          toolUses: this.parser.getToolUses(),
          usage: this.parser.getMessage()?.usage,
        };

        console.log(`[JOB] Completed successfully`);
        resolve(result);
      });

      this.process.on("error", (error) => {
        this.clearTimeout();
        console.log(`[JOB] Process error: ${error.message}`);
        resolve({
          ok: false,
          error: error.message,
        });
      });

      // Send prompt to stdin
      this.process.stdin?.write(request.request.prompt);
      this.process.stdin?.end();
    });
  }

  /**
   * Abort the running job.
   */
  abort(): void {
    this.aborted = true;
    this.clearTimeout();

    if (this.process) {
      try {
        this.process.kill("SIGTERM");
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill("SIGKILL");
          }
        }, 2000);
      } catch {
        // Process may have already exited
      }
    }
  }

  /**
   * Check if job is running.
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Build CLI arguments for claude -p.
   */
  private buildArgs(request: JobRequest): string[] {
    const args = [
      "-p", // Print mode (non-interactive)
      "--output-format", "stream-json",
      "--verbose", // Required for stream-json with -p
    ];

    // Model
    args.push("--model", this.getModelId(request.model));

    // Max turns
    if (request.request.maxTurns) {
      args.push("--max-turns", String(request.request.maxTurns));
    }

    // JSON schema
    if (request.request.jsonSchema) {
      args.push("--json-schema", request.request.jsonSchema);
    }

    // Disallowed tools
    if (request.request.disallowedTools?.length) {
      args.push("--disallowedTools", request.request.disallowedTools.join(","));
    }

    // System prompt
    if (request.request.systemPrompt) {
      args.push("--system-prompt", request.request.systemPrompt);
    }

    return args;
  }

  /**
   * Get model ID from shorthand.
   * Claude CLI accepts shorthand names directly (opus, sonnet, haiku).
   */
  private getModelId(model: "opus" | "sonnet" | "haiku"): string {
    return model;
  }

  /**
   * Clear the timeout.
   */
  private clearTimeout(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
