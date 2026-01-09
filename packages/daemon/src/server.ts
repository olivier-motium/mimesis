#!/usr/bin/env node
/**
 * Durable Streams server for session state.
 */

import { DurableStreamTestServer } from "@durable-streams/server";
import { DurableStream } from "@durable-streams/client";
import {
  sessionsStateSchema,
  type Session,
  type RecentOutput,
  type TerminalLink,
  type FileStatus,
} from "./schema.js";
import { StatusWatcher } from "./status-watcher.js";
import type { SessionState } from "./watcher.js";
import type { LogEntry } from "./types.js";
import {
  STREAM_HOST,
  STREAM_PORT,
  STREAM_PATH,
  STREAM_DATA_DIR,
  getStreamUrl,
  MESSAGE_LOOKBACK_COUNT,
  RECENT_OUTPUT_MAX_ITEMS,
  CONTENT_PREVIEW_LENGTH,
  CONTENT_TRUNCATE_LENGTH,
} from "./config/index.js";
import { formatToolUse, extractToolTarget } from "./tools/index.js";
import { TerminalLinkRepo } from "./db/terminal-link-repo.js";
import { rmSync, mkdirSync } from "node:fs";

export interface StreamServerOptions {
  port?: number;
  dataDir?: string;
}

export class StreamServer {
  private server: DurableStreamTestServer;
  private stream: DurableStream | null = null;
  private port: number;
  private dataDir: string;
  private streamUrl: string;
  // Track sessions for status update callbacks
  private sessionCache = new Map<string, SessionState>();
  // Terminal link repository for lookups
  private linkRepo: TerminalLinkRepo;
  // Status watcher for .claude/status.md files
  private statusWatcher: StatusWatcher;
  // Flag to prevent race conditions during shutdown
  private stopping = false;
  // Flag to pause publishing (for stream reset)
  private paused = false;

  constructor(options: StreamServerOptions = {}) {
    this.linkRepo = new TerminalLinkRepo();
    this.statusWatcher = new StatusWatcher();
    this.port = options.port ?? STREAM_PORT;
    this.dataDir = options.dataDir ?? STREAM_DATA_DIR;

    this.server = new DurableStreamTestServer({
      port: this.port,
      host: STREAM_HOST,
      dataDir: this.dataDir,
    });

    this.streamUrl = getStreamUrl(STREAM_HOST, this.port);

    // Handle status file updates
    this.statusWatcher.on("status", async ({ cwd, status }) => {
      // Find sessions with this cwd and republish
      for (const [sessionId, sessionState] of this.sessionCache) {
        if (sessionState.cwd === cwd) {
          console.log(`[STATUS] Status update for ${sessionId.slice(0, 8)}: ${status?.status ?? "null"}`);
          await this.publishSessionWithFileStatus(sessionState, status);
        }
      }
    });
  }

  async start(): Promise<void> {
    await this.server.start();
    console.log(`Durable Streams server running on http://${STREAM_HOST}:${this.port}`);

    // Create or connect to the sessions stream
    try {
      this.stream = await DurableStream.create({
        url: this.streamUrl,
        contentType: "application/json",
      });
    } catch (error: unknown) {
      // Stream might already exist, try to connect
      if ((error as { code?: string }).code === "CONFLICT_EXISTS") {
        this.stream = await DurableStream.connect({ url: this.streamUrl });
      } else {
        throw error;
      }
    }

  }

  async stop(): Promise<void> {
    this.stopping = true;  // Prevent new publishes during shutdown
    this.statusWatcher.stop();
    await this.server.stop();
    this.stream = null;
  }

  /**
   * Pause publishing (for stream reset operations).
   */
  pause(): void {
    this.paused = true;
    console.log("[STREAM] Publishing paused");
  }

  /**
   * Resume publishing after pause.
   */
  resume(): void {
    this.paused = false;
    console.log("[STREAM] Publishing resumed");
  }

  /**
   * Check if stream is paused.
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Clear stream data directory (for corruption recovery).
   * Does NOT stop the server - call pause() first if needed.
   */
  clearStreamData(): void {
    console.log("[STREAM] Clearing stream data directory:", this.dataDir);
    try {
      rmSync(this.dataDir, { recursive: true, force: true });
      mkdirSync(this.dataDir, { recursive: true });
      console.log("[STREAM] Stream data cleared");
    } catch (error) {
      console.error("[STREAM] Failed to clear stream data:", error);
      throw error;
    }
  }

  /**
   * Restart stream connection (for corruption recovery).
   * Stops the server, clears data if requested, and restarts.
   */
  async restart(clearData = false): Promise<void> {
    console.log("[STREAM] Restarting stream server (clearData:", clearData, ")");
    this.paused = true;

    // Stop the stream server
    await this.server.stop();
    this.stream = null;

    // Clear data if requested
    if (clearData) {
      this.clearStreamData();
    }

    // Recreate and restart server
    this.server = new DurableStreamTestServer({
      port: this.port,
      host: STREAM_HOST,
      dataDir: this.dataDir,
    });
    await this.server.start();

    // Reconnect to stream
    try {
      this.stream = await DurableStream.create({
        url: this.streamUrl,
        contentType: "application/json",
      });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "CONFLICT_EXISTS") {
        this.stream = await DurableStream.connect({ url: this.streamUrl });
      } else {
        throw error;
      }
    }

    this.paused = false;
    console.log("[STREAM] Stream server restarted");
  }

  /**
   * Get cached sessions (for republishing after reset).
   */
  getCachedSessions(): Map<string, SessionState> {
    return this.sessionCache;
  }

  getStreamUrl(): string {
    return this.streamUrl;
  }

  // ===========================================================================
  // Private: Session Building
  // ===========================================================================

  /**
   * Build a complete Session object from SessionState.
   * Uses file-based status for goal/summary (from hooks), with optional overrides.
   */
  private async buildSession(
    sessionState: SessionState,
    overrides: {
      fileStatus?: FileStatus | null;
      terminalLink?: TerminalLink | null;
    } = {}
  ): Promise<Session> {
    // Get file status first (needed for goal/summary)
    const fileStatus = overrides.fileStatus !== undefined
      ? overrides.fileStatus
      : this.statusWatcher.getStatus(sessionState.cwd);

    // Use file status for goal/summary (from hooks), fallback to original prompt
    const goal = fileStatus?.task ?? sessionState.originalPrompt ?? "";
    const summary = fileStatus?.summary ?? "";

    // Get terminal link: use override if provided, otherwise fetch from DB
    let terminalLink: TerminalLink | null;
    if (overrides.terminalLink !== undefined) {
      terminalLink = overrides.terminalLink;
    } else {
      const link = this.linkRepo.get(sessionState.sessionId);
      terminalLink = link
        ? {
            kittyWindowId: link.kittyWindowId,
            linkedAt: link.linkedAt,
            stale: link.stale,
          }
        : null;
    }

    return {
      sessionId: sessionState.sessionId,
      cwd: sessionState.cwd,
      gitBranch: sessionState.gitBranch,
      gitRepoUrl: sessionState.gitRepoUrl,
      gitRepoId: sessionState.gitRepoId,
      originalPrompt: sessionState.originalPrompt,
      status: sessionState.status.status,
      lastActivityAt: sessionState.status.lastActivityAt,
      messageCount: sessionState.status.messageCount,
      hasPendingToolUse: sessionState.status.hasPendingToolUse,
      pendingTool: extractPendingTool(sessionState),
      goal,
      summary,
      recentOutput: extractRecentOutput(sessionState.entries),
      terminalLink,
      fileStatus,
      embeddedPty: null,
    };
  }

  // ===========================================================================
  // Public: Session Publishing
  // ===========================================================================

  /**
   * Convert SessionState to Session schema and publish to stream.
   */
  async publishSession(sessionState: SessionState, operation: "insert" | "update" | "delete"): Promise<void> {
    if (this.stopping || this.paused || !this.stream) return;

    // Cache session state for callbacks
    this.sessionCache.set(sessionState.sessionId, sessionState);
    this.statusWatcher.watchProject(sessionState.cwd);

    const session = await this.buildSession(sessionState);

    let event;
    if (operation === "insert") {
      event = sessionsStateSchema.sessions.insert({ value: session });
    } else if (operation === "update") {
      event = sessionsStateSchema.sessions.update({ value: session });
    } else {
      event = sessionsStateSchema.sessions.delete({
        key: session.sessionId,
        oldValue: session,
      });
    }

    await this.stream.append(event);
  }

  /**
   * Publish session with updated file status (called from status watcher callback).
   */
  async publishSessionWithFileStatus(sessionState: SessionState, fileStatus: FileStatus | null): Promise<void> {
    if (this.stopping || this.paused || !this.stream) return;

    const session = await this.buildSession(sessionState, { fileStatus });
    const event = sessionsStateSchema.sessions.update({ value: session });
    await this.stream.append(event);
  }

  /**
   * Publish terminal link update for a session.
   */
  async publishTerminalLinkUpdate(sessionId: string, terminalLink: TerminalLink | null): Promise<void> {
    if (this.stopping || this.paused || !this.stream) return;

    const sessionState = this.sessionCache.get(sessionId);
    if (!sessionState) {
      console.log(`[LINK] No cached session state for ${sessionId.slice(0, 8)}`);
      return;
    }

    const session = await this.buildSession(sessionState, { terminalLink });
    const event = sessionsStateSchema.sessions.update({ value: session });
    await this.stream.append(event);
  }
}

/**
 * Extract recent output from entries for live view
 * Returns the last few meaningful messages in chronological order
 */
function extractRecentOutput(entries: LogEntry[], maxItems = RECENT_OUTPUT_MAX_ITEMS): RecentOutput[] {
  const output: RecentOutput[] = [];

  // Get the last N entries that are messages (user or assistant)
  const messageEntries = entries
    .filter((e) => e.type === "user" || e.type === "assistant")
    .slice(-MESSAGE_LOOKBACK_COUNT); // Look at last messages to find good content

  for (const entry of messageEntries) {
    if (entry.type === "assistant") {
      // Get first text block if any
      const textBlock = entry.message.content.find(
        (b): b is { type: "text"; text: string } => b.type === "text" && b.text.trim() !== ""
      );
      if (textBlock) {
        output.push({
          role: "assistant",
          content: textBlock.text.slice(0, CONTENT_PREVIEW_LENGTH),
        });
      }

      // Get tool uses
      const toolUses = entry.message.content.filter(
        (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use"
      );
      for (const tool of toolUses.slice(0, 2)) {
        output.push({
          role: "tool",
          content: formatToolUse(tool.name, tool.input),
        });
      }
    } else if (entry.type === "user") {
      // User prompts (string content, not tool results)
      if (typeof entry.message.content === "string" && entry.message.content.trim()) {
        output.push({
          role: "user",
          content: entry.message.content.slice(0, CONTENT_TRUNCATE_LENGTH),
        });
      }
    }
  }

  // Return only the last maxItems
  return output.slice(-maxItems);
}

/**
 * Extract pending tool info from session state.
 * Uses the tool registry for target extraction.
 */
function extractPendingTool(session: SessionState): Session["pendingTool"] {
  if (!session.status.hasPendingToolUse) {
    return null;
  }

  // Find the last assistant message with tool_use
  const entries = session.entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "assistant") {
      for (const block of entry.message.content) {
        if (block.type === "tool_use") {
          const tool = block.name;
          const input = block.input as Record<string, unknown>;
          const target = extractToolTarget(tool, input);
          return { tool, target };
        }
      }
    }
  }

  return null;
}

