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

/**
 * Conversation binding for stateful Commander turns.
 */
export interface ConversationBinding {
  /** Our conversation UUID */
  conversationId: string;
  /** Claude's session ID (captured from first turn for --resume) */
  claudeSessionId?: string;
  /** Whether this is the first turn or a continuation */
  mode: "first_turn" | "continue" | "resume";
}

export interface JobRequest {
  type: string;
  projectId?: string;
  repoRoot?: string;
  model: "opus" | "sonnet" | "haiku";
  /** Conversation binding for stateful Commander turns */
  conversation?: ConversationBinding;
  /** Environment variables to pass to the Claude process */
  env?: Record<string, string>;
  request: {
    prompt: string;
    systemPrompt?: string;
    /** System prompt to append (used with --append-system-prompt) */
    appendSystemPrompt?: string;
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

    return new Promise((resolve, reject) => {
      // Spawn claude process
      this.process = spawn(claudePath, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ANTHROPIC_MODEL: this.getModelId(request.model),
          ...request.env, // Custom environment variables (e.g., FLEET_ROLE)
        },
      });

      // Set timeout
      this.timeout = setTimeout(() => {
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
          // Non-JSON lines are ignored (e.g., warnings during startup)
        }
      });

      // Capture stderr for errors
      let stderr = "";
      this.process.stderr?.on("data", (data) => {
        stderr += data.toString();
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

        resolve(result);
      });

      this.process.on("error", (error) => {
        this.clearTimeout();
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
      "--verbose", // Required for stream-json in print mode
      "--dangerously-skip-permissions", // Required: headless mode can't approve interactively
    ];

    // Model
    args.push("--model", this.getModelId(request.model));

    // Conversation continuity
    if (request.conversation) {
      if (request.conversation.mode === "resume" && request.conversation.claudeSessionId) {
        // Resume a specific conversation by session ID
        args.push("--resume", request.conversation.claudeSessionId);
      } else if (request.conversation.mode === "continue") {
        // Continue most recent conversation in cwd
        args.push("--continue");
      }
      // first_turn: no continuation flags, starts new conversation
    }

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

    // System prompt (full replacement)
    if (request.request.systemPrompt) {
      args.push("--system-prompt", request.request.systemPrompt);
    }

    // Append system prompt (used for fleet prelude injection)
    if (request.request.appendSystemPrompt) {
      args.push("--append-system-prompt", request.request.appendSystemPrompt);
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
