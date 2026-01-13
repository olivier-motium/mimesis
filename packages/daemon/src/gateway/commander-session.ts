/**
 * Commander Session Manager - Headless mode Commander with session resumption.
 *
 * Uses Claude's headless mode (`claude -p`) with `--resume` for context continuity.
 * Each prompt spawns a new Claude process that runs to completion.
 *
 * Benefits:
 * - Reliable JSONL output (headless mode writes structured logs)
 * - All hooks fire naturally (PostToolUse, etc.)
 * - Conversation context preserved via --resume <session-id>
 * - Prompt queue for handling concurrent requests
 * - Session persistence via captured session ID
 */

import path from "node:path";
import os from "node:os";
import { watch, type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import type { PtyBridge, PtySessionInfo } from "./pty-bridge.js";
import type { SessionStore, UIStatus, TrackedSession, SessionStoreEvent } from "./session-store.js";
import type { StatusWatcher, StatusUpdateEvent } from "../status-watcher.js";
import { ConversationRepo } from "../fleet-db/conversation-repo.js";
import { FleetPreludeBuilder, type FleetPrelude } from "./fleet-prelude-builder.js";
import { COMMANDER_CWD } from "../config/fleet.js";
import { getTracer, recordError } from "../telemetry/spans.js";
import { tailJSONL } from "../parser.js";
import { convertEntriesToEvents } from "./entry-converter.js";
import type { SessionEvent } from "./protocol.js";

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
  statusWatcher?: StatusWatcher;
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
  private statusWatcher?: StatusWatcher;
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

  // Session ID capture (directory watching - glob patterns unreliable on macOS)
  private sessionWatcher: FSWatcher | null = null;
  private ptySpawnedAt: number | null = null; // Timestamp when PTY was created

  // Subscriptions
  private statusUnsubscribe: (() => void) | null = null;
  private statusWatcherUnsubscribe: (() => void) | null = null;

  // JSONL content watching (for structured content display)
  private jsonlWatcher: FSWatcher | null = null;
  private jsonlBytePosition: number = 0;
  private contentSeq: number = 0;

  constructor(options: CommanderSessionManagerOptions) {
    super();
    this.ptyBridge = options.ptyBridge;
    this.sessionStore = options.sessionStore;
    this.statusWatcher = options.statusWatcher;
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
   *
   * Uses headless mode (-p flag) - each prompt spawns Claude with the
   * prompt as a CLI argument. This is cleaner than interactive mode
   * for discrete prompts.
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
        return;
      }

      // Run prompt directly (headless mode)
      span.setAttribute("commander.action", "sent");
      await this.runPrompt(prompt);
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
      // Stop watching for session file
      if (this.sessionWatcher) {
        await this.sessionWatcher.close();
        this.sessionWatcher = null;
      }

      // Unsubscribe from status file updates
      if (this.statusWatcherUnsubscribe) {
        this.statusWatcherUnsubscribe();
        this.statusWatcherUnsubscribe = null;
      }

      // Stop JSONL content watcher
      this.stopJsonlWatcher();

      // Kill existing PTY
      if (this.ptySessionId) {
        await this.ptyBridge.stop(this.ptySessionId);
        this.ptySessionId = null;
      }

      // Clear state
      this.claudeSessionId = null;
      this.ptySpawnedAt = null;
      this.status = "idle";
      this.isFirstTurn = true;
      this.turnCount = 0;
      this.promptQueue = [];
      this.isDraining = false;

      // Reset DB record
      this.conversationRepo.resetCommander();

      // Emit state change
      this.emitStateChange();
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
    }
  }

  /**
   * Handle PTY exit event.
   * Called by gateway when Commander's PTY process exits.
   */
  handlePtyExit(_exitCode: number, _signal?: string): void {
    // Clear PTY session ID (PTY is gone)
    this.ptySessionId = null;
    this.ptySpawnedAt = null;

    // Transition to idle
    if (this.status !== "idle") {
      this.status = "idle";
      this.emitStateChange();
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

    // Stop watching for session file
    if (this.sessionWatcher) {
      await this.sessionWatcher.close();
      this.sessionWatcher = null;
    }

    // Unsubscribe from status file updates
    if (this.statusWatcherUnsubscribe) {
      this.statusWatcherUnsubscribe();
      this.statusWatcherUnsubscribe = null;
    }

    // Stop JSONL content watcher
    this.stopJsonlWatcher();

    // Stop PTY if running
    if (this.ptySessionId) {
      await this.ptyBridge.stop(this.ptySessionId);
    }
  }

  // ===========================================================================
  // Private: Session Management (Headless Mode)
  // ===========================================================================

  /**
   * Run a prompt in headless mode (-p flag).
   * Each invocation spawns Claude with the prompt as a CLI argument.
   * Uses --resume to maintain conversation context across invocations.
   */
  private async runPrompt(prompt: string): Promise<void> {
    const tracer = getTracer();
    const span = tracer.startSpan("commander.runPrompt", {
      attributes: {
        "commander.prompt_length": prompt.length,
        "commander.turn_count": this.turnCount + 1,
        "commander.is_first_turn": this.isFirstTurn,
        "commander.has_session": !!this.claudeSessionId,
      },
    });

    try {
      const conversation = this.conversationRepo.getOrCreateCommander();

      // Build fleet prelude and inject context
      const prelude = this.preludeBuilder.build({
        lastEventIdSeen: conversation.lastOutboxEventIdSeen ?? 0,
        maxEvents: 50,
        includeDocDriftWarnings: true,
      });
      const fullPrompt = this.buildPromptWithContext(prompt, prelude);

      // Build Claude command
      const command = this.buildClaudeCommand(fullPrompt);

      // Update status
      this.status = "working";
      this.turnCount++;
      this.emitStateChange();

      // Create PTY and setup watchers
      const ptyInfo = await this.createPtyWithSetup(command);

      span.setAttribute("commander.pty_session_id", ptyInfo.sessionId);
      span.setAttribute("commander.pid", ptyInfo.pid);

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
   * Build the full prompt with fleet context injected.
   * Adds system-reminder blocks for system prompt (first turn) and fleet delta.
   */
  private buildPromptWithContext(prompt: string, prelude: FleetPrelude): string {
    let fullPrompt = prompt;

    // On first turn, inject system prompt
    if (this.isFirstTurn) {
      fullPrompt = `<system-reminder>\n${prelude.systemPrompt}\n</system-reminder>\n\n${fullPrompt}`;
    }

    // Inject fleet delta if there's activity
    if (this.hasFleetActivity(prelude)) {
      fullPrompt = `<system-reminder>\n${prelude.fleetDelta}\n</system-reminder>\n\n${fullPrompt}`;
    }

    return fullPrompt;
  }

  /**
   * Build the Claude CLI command for headless mode.
   * Format: claude -p "<prompt>" [--resume <session-id>] --dangerously-skip-permissions
   */
  private buildClaudeCommand(fullPrompt: string): string[] {
    const command: string[] = ["claude", "-p", fullPrompt];

    // Resume existing conversation if we have a session ID
    if (this.claudeSessionId) {
      command.push("--resume", this.claudeSessionId);
    }

    // Allow all tools without permission prompts
    command.push("--dangerously-skip-permissions");

    return command;
  }

  /**
   * Create PTY session and setup all associated watchers.
   * Handles session ID capture, status watching, and JSONL watching.
   */
  private async createPtyWithSetup(command: string[]): Promise<PtySessionInfo> {
    // Start watching for session file before spawning (for new sessions)
    if (!this.claudeSessionId) {
      this.ptySpawnedAt = Date.now();
      this.startSessionIdCapture();
    }

    // Create PTY session with command
    const ptyInfo = await this.ptyBridge.create({
      projectId: COMMANDER_PROJECT_ID,
      cwd: COMMANDER_CWD,
      command,
      env: {
        FLEET_SESSION_ID: "commander",
      },
    });

    this.ptySessionId = ptyInfo.sessionId;

    // Register with session store
    this.sessionStore.addFromPty({
      sessionId: ptyInfo.sessionId,
      projectId: COMMANDER_PROJECT_ID,
      cwd: COMMANDER_CWD,
      pid: ptyInfo.pid,
    });

    // Start watching Commander directory for status file changes
    if (this.statusWatcher) {
      this.statusWatcher.watchProject(COMMANDER_CWD);
    }

    // If resuming, start JSONL watcher now
    if (this.claudeSessionId && !this.jsonlWatcher) {
      this.subscribeToStatusWatcher();
    }

    return ptyInfo;
  }

  /**
   * Check if fleet prelude has meaningful activity.
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
   * Watches the directory directly instead of using a glob pattern because
   * macOS FSEvents doesn't reliably fire `add` events for glob patterns.
   *
   * Claude creates session files at:
   * ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
   */
  private startSessionIdCapture(): void {
    // Encode Commander CWD path (replace / with -)
    const encodedCwd = this.encodePathForClaude(COMMANDER_CWD);
    const sessionsDir = path.join(os.homedir(), ".claude", "projects", encodedCwd);

    // Watch directory directly (not glob pattern) - FSEvents handles this reliably
    this.sessionWatcher = watch(sessionsDir, {
      ignoreInitial: true,
      depth: 0,
    });

    this.sessionWatcher.on("add", async (filePath) => {
      // Filter for .jsonl files only
      if (!filePath.endsWith(".jsonl")) {
        return;
      }

      // Extract session ID from filename
      const sessionId = path.basename(filePath, ".jsonl");

      // Ignore if we already have this session ID
      if (this.claudeSessionId === sessionId) {
        return;
      }

      this.claudeSessionId = sessionId;

      // Store in DB for persistence
      const conversation = this.conversationRepo.getOrCreateCommander();
      this.conversationRepo.updateClaudeSessionId(
        conversation.conversationId,
        sessionId
      );

      // Subscribe to StatusWatcher for this Claude session ID
      this.subscribeToStatusWatcher();

      this.emitStateChange();

      // Stop watching once we have the ID
      if (this.sessionWatcher) {
        await this.sessionWatcher.close();
        this.sessionWatcher = null;
      }
    });

    this.sessionWatcher.on("error", () => {
      // Session watcher errors are non-fatal
    });
  }

  /**
   * Encode path for Claude's project directory naming.
   * Claude replaces both / and . with - in path encoding.
   */
  private encodePathForClaude(cwdPath: string): string {
    // Replace / and . with -
    return cwdPath.replace(/[\/\.]/g, "-");
  }

  /**
   * Subscribe to StatusWatcher for Commander's Claude session ID.
   * This allows direct status file updates, bypassing SessionStore lookup mismatch.
   * Called both for new sessions (after ID capture) and resumed sessions.
   */
  private subscribeToStatusWatcher(): void {
    if (!this.statusWatcher || this.statusWatcherUnsubscribe) {
      return;
    }

    const boundHandler = this.handleStatusFileUpdate.bind(this);
    this.statusWatcher.on("status", boundHandler);
    this.statusWatcherUnsubscribe = () => {
      this.statusWatcher?.off("status", boundHandler);
    };

    // Start JSONL watcher for structured content display
    this.startJsonlWatcher();
  }

  // ===========================================================================
  // Private: JSONL Content Watching
  // ===========================================================================

  /**
   * Start watching Commander's JSONL file for structured content events.
   * Uses incremental reading (tailJSONL) to emit events as they arrive.
   */
  private startJsonlWatcher(): void {
    if (!this.claudeSessionId || this.jsonlWatcher) {
      return;
    }

    const encodedCwd = this.encodePathForClaude(COMMANDER_CWD);
    const jsonlPath = path.join(
      os.homedir(),
      ".claude",
      "projects",
      encodedCwd,
      `${this.claudeSessionId}.jsonl`
    );

    this.jsonlWatcher = watch(jsonlPath, {
      ignoreInitial: false, // Process existing content on start
    });

    this.jsonlWatcher.on("add", () => this.handleJsonlChange(jsonlPath));
    this.jsonlWatcher.on("change", () => this.handleJsonlChange(jsonlPath));

    this.jsonlWatcher.on("error", () => {
      // JSONL watcher errors are non-fatal
    });
  }

  /**
   * Handle JSONL file changes - read new entries and emit content events.
   */
  private async handleJsonlChange(jsonlPath: string): Promise<void> {
    try {
      const result = await tailJSONL(jsonlPath, this.jsonlBytePosition);
      this.jsonlBytePosition = result.newPosition;

      if (result.entries.length === 0) {
        return;
      }

      // Convert log entries to session events
      const { events } = convertEntriesToEvents(result.entries);

      // Emit each event with sequence number
      for (const event of events) {
        this.emit("commander.content", {
          seq: this.contentSeq++,
          event,
        });
      }
    } catch {
      // File might not exist yet or be temporarily locked - non-fatal
    }
  }

  /**
   * Stop JSONL watcher and reset state.
   */
  private stopJsonlWatcher(): void {
    if (this.jsonlWatcher) {
      this.jsonlWatcher.close();
      this.jsonlWatcher = null;
    }
    this.jsonlBytePosition = 0;
    this.contentSeq = 0;
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
          this.status = newStatus;

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
   * Handle status file updates directly from StatusWatcher.
   * This bypasses SessionStore lookup which uses PTY session ID,
   * while status files use Claude session ID.
   */
  private handleStatusFileUpdate(event: StatusUpdateEvent): void {
    // Only care about our Claude session
    if (event.sessionId !== this.claudeSessionId) {
      return;
    }

    const newStatus = this.mapToCommanderStatus(event.status?.status);
    if (newStatus !== this.status) {
      this.status = newStatus;

      this.emitStateChange();

      // Drain queue when ready for input
      if (newStatus === "waiting_for_input" || newStatus === "idle") {
        this.drainQueue();
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

      span.setAttribute("commander.remaining_items", this.promptQueue.length);

      // Run it (headless mode)
      await this.runPrompt(item.prompt);
    } catch (error) {
      recordError(span, error as Error);
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
    const state = this.getState();
    this.emitEvent({
      type: "commander.state",
      state,
    });
  }
}
