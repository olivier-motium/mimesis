/**
 * Commander Session Manager - PTY-based Commander lifecycle and prompt queue.
 *
 * Transforms Commander from headless jobs (`claude -p`) to a persistent PTY session.
 * Benefits:
 * - All hooks fire naturally (PostToolUse, etc.)
 * - Native conversation state (no --continue needed)
 * - Prompt queue instead of BUSY rejection
 * - Session persistence via captured session ID
 */

import path from "node:path";
import os from "node:os";
import { watch, type FSWatcher } from "chokidar";
import { readdir } from "node:fs/promises";
import { EventEmitter } from "node:events";
import type { PtyBridge, PtySessionInfo } from "./pty-bridge.js";
import type { SessionStore, UIStatus, TrackedSession, SessionStoreEvent } from "./session-store.js";
import { ConversationRepo } from "../fleet-db/conversation-repo.js";
import { FleetPreludeBuilder, type FleetPrelude } from "./fleet-prelude-builder.js";
import { COMMANDER_CWD } from "../config/fleet.js";
import { getTracer, recordError } from "../telemetry/spans.js";

// =============================================================================
// Types
// =============================================================================

export type CommanderStatus = "idle" | "working" | "waiting_for_input";

export interface PromptQueueItem {
  prompt: string;
  queuedAt: string;
}

export interface CommanderState {
  status: CommanderStatus;
  ptySessionId: string | null;
  claudeSessionId: string | null;
  queuedPrompts: number;
  isFirstTurn: boolean;
}

export interface CommanderSessionManagerOptions {
  ptyBridge: PtyBridge;
  sessionStore: SessionStore;
}

// Commander-specific events
export interface CommanderStateEvent {
  type: "commander.state";
  state: CommanderState;
}

export interface CommanderQueuedEvent {
  type: "commander.queued";
  position: number;
  prompt: string;
}

export interface CommanderReadyEvent {
  type: "commander.ready";
}

export type CommanderEvent =
  | CommanderStateEvent
  | CommanderQueuedEvent
  | CommanderReadyEvent;

// Special project ID for Commander
const COMMANDER_PROJECT_ID = "fleet-commander";

// =============================================================================
// CommanderSessionManager
// =============================================================================

/**
 * Manages Commander's PTY lifecycle and prompt queue.
 */
export class CommanderSessionManager extends EventEmitter {
  private ptyBridge: PtyBridge;
  private sessionStore: SessionStore;
  private conversationRepo: ConversationRepo;
  private preludeBuilder: FleetPreludeBuilder;

  // Session state
  private ptySessionId: string | null = null;
  private claudeSessionId: string | null = null;
  private status: CommanderStatus = "idle";
  private isFirstTurn = true;
  private turnCount = 0;

  // Prompt queue
  private promptQueue: PromptQueueItem[] = [];
  private isDraining = false;

  // Session ID capture
  private sessionWatcher: FSWatcher | null = null;

  // Subscriptions
  private statusUnsubscribe: (() => void) | null = null;

  constructor(options: CommanderSessionManagerOptions) {
    super();
    this.ptyBridge = options.ptyBridge;
    this.sessionStore = options.sessionStore;
    this.conversationRepo = new ConversationRepo();
    this.preludeBuilder = new FleetPreludeBuilder();

    // Subscribe to session store to detect status changes
    this.statusUnsubscribe = this.sessionStore.subscribe(
      this.handleSessionStoreEvent.bind(this)
    );
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Send a prompt to Commander.
   * Queues if busy, sends immediately if idle/waiting.
   */
  async sendPrompt(prompt: string): Promise<void> {
    const tracer = getTracer();
    const span = tracer.startSpan("commander.sendPrompt", {
      attributes: {
        "commander.prompt_length": prompt.length,
        "commander.status": this.status,
        "commander.queue_size": this.promptQueue.length,
      },
    });

    try {
      // Ensure session exists (lazy creation)
      await this.ensureSession();

      // Queue if busy
      if (this.status === "working") {
        const queueItem: PromptQueueItem = {
          prompt,
          queuedAt: new Date().toISOString(),
        };
        this.promptQueue.push(queueItem);

        this.emitEvent({
          type: "commander.queued",
          position: this.promptQueue.length,
          prompt,
        });

        span.setAttribute("commander.action", "queued");
        span.setAttribute("commander.queue_position", this.promptQueue.length);
        console.log(`[COMMANDER] Prompt queued (position ${this.promptQueue.length})`);
        return;
      }

      // Send immediately
      span.setAttribute("commander.action", "sent");
      await this.writePrompt(prompt);
    } catch (error) {
      recordError(span, error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Reset Commander - kills PTY, clears queue, starts fresh.
   */
  async reset(): Promise<void> {
    const tracer = getTracer();
    const span = tracer.startSpan("commander.reset", {
      attributes: {
        "commander.queue_size": this.promptQueue.length,
        "commander.had_session": !!this.ptySessionId,
      },
    });

    try {
      console.log("[COMMANDER] Resetting session...");

      // Stop watching for session file
      if (this.sessionWatcher) {
        await this.sessionWatcher.close();
        this.sessionWatcher = null;
      }

      // Kill existing PTY
      if (this.ptySessionId) {
        await this.ptyBridge.stop(this.ptySessionId);
        this.ptySessionId = null;
      }

      // Clear state
      this.claudeSessionId = null;
      this.status = "idle";
      this.isFirstTurn = true;
      this.turnCount = 0;
      this.promptQueue = [];
      this.isDraining = false;

      // Reset DB record
      this.conversationRepo.resetCommander();

      // Emit state change
      this.emitStateChange();

      console.log("[COMMANDER] Session reset complete");
    } catch (error) {
      recordError(span, error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Cancel current operation (SIGINT).
   */
  async cancel(): Promise<void> {
    if (this.ptySessionId) {
      await this.ptyBridge.signal(this.ptySessionId, "SIGINT");
      console.log("[COMMANDER] Sent SIGINT to cancel");
    }
  }

  /**
   * Get current Commander state for UI.
   */
  getState(): CommanderState {
    return {
      status: this.status,
      ptySessionId: this.ptySessionId,
      claudeSessionId: this.claudeSessionId,
      queuedPrompts: this.promptQueue.length,
      isFirstTurn: this.isFirstTurn,
    };
  }

  /**
   * Get the PTY session ID (for gateway to route events).
   */
  getPtySessionId(): string | null {
    return this.ptySessionId;
  }

  /**
   * Initialize Commander (called on daemon start).
   * Attempts to resume existing session if possible.
   */
  async initialize(): Promise<void> {
    const conversation = this.conversationRepo.getOrCreateCommander();

    if (conversation.claudeSessionId) {
      console.log(`[COMMANDER] Found existing session: ${conversation.claudeSessionId}`);
      this.claudeSessionId = conversation.claudeSessionId;
      this.isFirstTurn = false;
      // Note: We don't auto-create PTY here - will resume on first prompt
    }
  }

  /**
   * Shutdown Commander gracefully.
   */
  async shutdown(): Promise<void> {
    // Unsubscribe from session store
    if (this.statusUnsubscribe) {
      this.statusUnsubscribe();
      this.statusUnsubscribe = null;
    }

    // Stop session watcher
    if (this.sessionWatcher) {
      await this.sessionWatcher.close();
      this.sessionWatcher = null;
    }

    // Stop PTY if running
    if (this.ptySessionId) {
      await this.ptyBridge.stop(this.ptySessionId);
    }
  }

  // ===========================================================================
  // Private: Session Management
  // ===========================================================================

  /**
   * Ensure PTY session exists (lazy creation).
   */
  private async ensureSession(): Promise<void> {
    if (this.ptySessionId) {
      // Session already exists
      return;
    }

    const tracer = getTracer();
    const span = tracer.startSpan("commander.ensureSession", {
      attributes: {
        "commander.is_resume": !!this.claudeSessionId,
        "commander.claude_session_id": this.claudeSessionId ?? "none",
      },
    });

    try {
      console.log("[COMMANDER] Creating new PTY session...");

      // Build command - include --resume if we have a session ID
      const command: string[] = ["claude"];

      // Resume existing conversation if we have a session ID
      if (this.claudeSessionId) {
        command.push("--resume", this.claudeSessionId);
        console.log(`[COMMANDER] Resuming session: ${this.claudeSessionId}`);
      }

      // Allow all tools without permission prompts
      command.push("--dangerously-skip-permissions");

      // Create PTY session
      const ptyInfo = await this.ptyBridge.create({
        projectId: COMMANDER_PROJECT_ID,
        cwd: COMMANDER_CWD,
        command,
        env: {
          FLEET_SESSION_ID: "commander",
        },
      });

      this.ptySessionId = ptyInfo.sessionId;
      // Don't set status to "working" here - PTY is waiting for input
      // Status will be set to "working" in writePrompt() when we send a prompt
      this.status = "waiting_for_input";

      // Register with session store
      this.sessionStore.addFromPty({
        sessionId: ptyInfo.sessionId,
        projectId: COMMANDER_PROJECT_ID,
        cwd: COMMANDER_CWD,
        pid: ptyInfo.pid,
      });

      // Start watching for Claude's session file to capture session ID
      if (!this.claudeSessionId) {
        this.startSessionIdCapture();
      }

      this.emitStateChange();

      span.setAttribute("commander.pty_session_id", ptyInfo.sessionId);
      span.setAttribute("commander.pid", ptyInfo.pid);
      console.log(`[COMMANDER] PTY session created: ${ptyInfo.sessionId} (pid=${ptyInfo.pid})`);
    } catch (error) {
      recordError(span, error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Write prompt to PTY stdin with fleet prelude injection.
   */
  private async writePrompt(prompt: string): Promise<void> {
    if (!this.ptySessionId) {
      throw new Error("No PTY session");
    }

    const tracer = getTracer();
    const span = tracer.startSpan("commander.writePrompt", {
      attributes: {
        "commander.prompt_length": prompt.length,
        "commander.turn_count": this.turnCount + 1,
        "commander.is_first_turn": this.isFirstTurn,
      },
    });

    try {
      const conversation = this.conversationRepo.getOrCreateCommander();

      // Build fleet prelude
      const prelude = this.preludeBuilder.build({
        lastEventIdSeen: conversation.lastOutboxEventIdSeen ?? 0,
        maxEvents: 50,
        includeDocDriftWarnings: true,
      });

      // Build full prompt with fleet context injection
      let fullPrompt = prompt;

      // On first turn, inject system prompt as system-reminder
      if (this.isFirstTurn) {
        fullPrompt = `<system-reminder>\n${prelude.systemPrompt}\n</system-reminder>\n\n${fullPrompt}`;
      }

      // Inject fleet delta if there's activity
      if (this.hasFleetActivity(prelude)) {
        fullPrompt = `<system-reminder>\n${prelude.fleetDelta}\n</system-reminder>\n\n${fullPrompt}`;
      }

      // Update status
      this.status = "working";
      this.turnCount++;
      this.emitStateChange();

      // Write to PTY
      // Note: Claude PTY expects input terminated with newline
      this.ptyBridge.write(this.ptySessionId, fullPrompt + "\n");

      console.log(`[COMMANDER] Sent prompt (turn ${this.turnCount}, ${fullPrompt.length} chars)`);

      // Update cursor after sending (will be committed when turn completes)
      this.conversationRepo.updateLastOutboxEventSeen(
        conversation.conversationId,
        prelude.newCursor
      );

      // Mark first turn complete
      if (this.isFirstTurn) {
        this.isFirstTurn = false;
      }

      span.setAttribute("commander.full_prompt_length", fullPrompt.length);
      span.setAttribute("commander.has_prelude", this.hasFleetActivity(prelude));
    } catch (error) {
      recordError(span, error as Error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Check if fleet prelude has meaningful activity.
   * Fixes bug in original hasActivity check.
   */
  private hasFleetActivity(prelude: FleetPrelude): boolean {
    return prelude.fleetDelta.trim().length > 0;
  }

  // ===========================================================================
  // Private: Session ID Capture
  // ===========================================================================

  /**
   * Start watching for Claude's session file to capture session ID.
   *
   * Claude creates session files at:
   * ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
   */
  private startSessionIdCapture(): void {
    // Encode Commander CWD path (replace / with -)
    const encodedCwd = this.encodePathForClaude(COMMANDER_CWD);
    const sessionsDir = path.join(os.homedir(), ".claude", "projects", encodedCwd);

    console.log(`[COMMANDER] Watching for session file in: ${sessionsDir}`);

    // Watch for new .jsonl files
    this.sessionWatcher = watch(`${sessionsDir}/*.jsonl`, {
      ignoreInitial: true,
      depth: 0,
    });

    this.sessionWatcher.on("add", async (filePath) => {
      // Extract session ID from filename
      const sessionId = path.basename(filePath, ".jsonl");

      // Ignore if we already have this session ID
      if (this.claudeSessionId === sessionId) {
        return;
      }

      console.log(`[COMMANDER] Captured Claude session ID: ${sessionId}`);

      this.claudeSessionId = sessionId;

      // Store in DB for persistence
      const conversation = this.conversationRepo.getOrCreateCommander();
      this.conversationRepo.updateClaudeSessionId(
        conversation.conversationId,
        sessionId
      );

      this.emitStateChange();

      // Stop watching once we have the ID
      if (this.sessionWatcher) {
        await this.sessionWatcher.close();
        this.sessionWatcher = null;
      }
    });

    this.sessionWatcher.on("error", (error) => {
      console.error("[COMMANDER] Session watcher error:", error);
    });

    // Also check for existing files (in case session was created before watch started)
    this.checkExistingSessionFiles(sessionsDir);
  }

  /**
   * Check for existing session files in case one was created before watching started.
   */
  private async checkExistingSessionFiles(sessionsDir: string): Promise<void> {
    try {
      const files = await readdir(sessionsDir);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

      if (jsonlFiles.length > 0) {
        // Use the most recent file (by name, which includes timestamp)
        const mostRecent = jsonlFiles.sort().pop()!;
        const sessionId = path.basename(mostRecent, ".jsonl");

        if (!this.claudeSessionId) {
          console.log(`[COMMANDER] Found existing session file: ${sessionId}`);
          this.claudeSessionId = sessionId;

          const conversation = this.conversationRepo.getOrCreateCommander();
          this.conversationRepo.updateClaudeSessionId(
            conversation.conversationId,
            sessionId
          );

          this.emitStateChange();
        }
      }
    } catch {
      // Directory may not exist yet - that's fine
    }
  }

  /**
   * Encode path for Claude's project directory naming.
   * Claude replaces both / and . with - in path encoding.
   */
  private encodePathForClaude(cwdPath: string): string {
    // Replace / and . with -
    return cwdPath.replace(/[\/\.]/g, "-");
  }

  // ===========================================================================
  // Private: Status Detection and Queue Draining
  // ===========================================================================

  /**
   * Handle session store events to detect status changes.
   */
  private handleSessionStoreEvent(event: SessionStoreEvent): void {
    // Only care about our session
    if (event.type === "updated" && event.sessionId === this.ptySessionId) {
      const updates = event.updates;

      // Check for status change
      if (updates.status || updates.fileStatus?.status) {
        const newStatus = this.mapToCommanderStatus(
          updates.status ?? updates.fileStatus?.status
        );

        if (newStatus !== this.status) {
          const oldStatus = this.status;
          this.status = newStatus;

          console.log(`[COMMANDER] Status changed: ${oldStatus} → ${newStatus}`);

          this.emitStateChange();

          // Drain queue when ready for input
          if (newStatus === "waiting_for_input" || newStatus === "idle") {
            this.drainQueue();
          }
        }
      }
    }
  }

  /**
   * Map UI status to Commander status.
   */
  private mapToCommanderStatus(status: UIStatus | string | undefined): CommanderStatus {
    switch (status) {
      case "working":
        return "working";
      case "waiting":
      case "waiting_for_input":
      case "waiting_for_approval":
        return "waiting_for_input";
      case "idle":
      case "completed":
      case "error":
      default:
        return "idle";
    }
  }

  /**
   * Drain the prompt queue when Commander is ready.
   */
  private async drainQueue(): Promise<void> {
    // Prevent concurrent draining
    if (this.isDraining || this.promptQueue.length === 0) {
      return;
    }

    const tracer = getTracer();
    const span = tracer.startSpan("commander.drainQueue", {
      attributes: {
        "commander.queue_size": this.promptQueue.length,
      },
    });

    this.isDraining = true;

    try {
      // Pop next prompt from queue
      const item = this.promptQueue.shift()!;
      console.log(`[COMMANDER] Draining queue: ${this.promptQueue.length} remaining`);

      span.setAttribute("commander.remaining_items", this.promptQueue.length);

      // Send it
      await this.writePrompt(item.prompt);
    } catch (error) {
      recordError(span, error as Error);
      console.error("[COMMANDER] Queue drain error:", error);
    } finally {
      this.isDraining = false;
      span.end();
    }
  }

  // ===========================================================================
  // Private: Events
  // ===========================================================================

  /**
   * Emit a Commander event.
   */
  private emitEvent(event: CommanderEvent): void {
    this.emit("commander", event);
  }

  /**
   * Emit state change event.
   */
  private emitStateChange(): void {
    this.emitEvent({
      type: "commander.state",
      state: this.getState(),
    });
  }
}
