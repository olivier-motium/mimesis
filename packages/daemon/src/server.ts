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
import { CompactionWatcher, type CompactionEvent } from "./compaction-watcher.js";
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
  // Track session creation times for compaction comparison
  private sessionCreatedAt = new Map<string, string>();
  // Track work chain IDs (persists across compaction)
  private sessionWorkChainId = new Map<string, string>();
  // Track work chain names (user-defined, persists across compaction)
  private workChainNames = new Map<string, string>();
  // Track compaction counts per work chain
  private workChainCompactionCounts = new Map<string, number>();
  // Terminal link repository for lookups
  private linkRepo: TerminalLinkRepo;
  // Status watcher for .claude/status.md files
  private statusWatcher: StatusWatcher;
  // Compaction watcher for session supersession
  private compactionWatcher: CompactionWatcher;
  // Pending status updates for sessions not yet in cache (race condition fix)
  private pendingStatusUpdates = new Map<string, { cwd: string; status: FileStatus | null }>();
  // Flag to prevent race conditions during shutdown
  private stopping = false;
  // Flag to pause publishing (for stream reset)
  private paused = false;

  constructor(options: StreamServerOptions = {}) {
    this.linkRepo = new TerminalLinkRepo();
    this.statusWatcher = new StatusWatcher();
    this.compactionWatcher = new CompactionWatcher();
    this.port = options.port ?? STREAM_PORT;
    this.dataDir = options.dataDir ?? STREAM_DATA_DIR;

    this.server = new DurableStreamTestServer({
      port: this.port,
      host: STREAM_HOST,
      dataDir: this.dataDir,
    });

    this.streamUrl = getStreamUrl(STREAM_HOST, this.port);

    // Handle status file updates
    this.statusWatcher.on("status", async ({ sessionId, cwd, status }) => {
      // Session-specific files have the actual sessionId
      // Legacy files have "legacy:<cwd>" as sessionId, need to match by cwd
      if (sessionId.startsWith("legacy:")) {
        // Legacy file - match all sessions with this cwd
        for (const [cachedSessionId, sessionState] of this.sessionCache) {
          if (sessionState.cwd === cwd) {
            console.log(`[STATUS] Legacy status update for ${cachedSessionId.slice(0, 8)}: ${status?.status ?? "null"}`);
            await this.publishSessionWithFileStatus(sessionState, status);
          }
        }
      } else {
        // Session-specific file - direct match
        const sessionState = this.sessionCache.get(sessionId);
        if (sessionState) {
          console.log(`[STATUS] Session status update for ${sessionId.slice(0, 8)}: ${status?.status ?? "null"}`);
          await this.publishSessionWithFileStatus(sessionState, status);
        } else {
          // Session not in cache yet - queue for later (race condition fix)
          console.log(`[STATUS] Queuing update for unknown session ${sessionId.slice(0, 8)} (will apply when session discovered)`);
          this.pendingStatusUpdates.set(sessionId, { cwd, status });
        }
      }
    });

    // Handle compaction events - mark older sessions as superseded
    this.compactionWatcher.on("compaction", async (event: CompactionEvent) => {
      await this.handleCompaction(event);
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
    this.compactionWatcher.stop();
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

    // Get createdAt from cache or use lastActivityAt as fallback
    const createdAt = this.sessionCreatedAt.get(sessionState.sessionId) ?? sessionState.status.lastActivityAt;

    // Get work chain info
    const workChainId = this.getOrCreateWorkChainId(sessionState.sessionId);
    const workChainName = this.workChainNames.get(workChainId) ?? null;
    const compactionCount = this.workChainCompactionCounts.get(workChainId) ?? 0;

    return {
      sessionId: sessionState.sessionId,
      cwd: sessionState.cwd,
      gitBranch: sessionState.gitBranch,
      gitRepoUrl: sessionState.gitRepoUrl,
      gitRepoId: sessionState.gitRepoId,
      originalPrompt: sessionState.originalPrompt,
      status: sessionState.status.status,
      createdAt,
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
      // Work chain tracking - inherit from cache or generate new
      workChainId,
      workChainName,
      compactionCount,
      // Supersession fields - defaults, will be updated by handleCompaction
      superseded: false,
      supersededBy: null,
      supersededAt: null,
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

    // Track createdAt on first insert
    if (operation === "insert" && !this.sessionCreatedAt.has(sessionState.sessionId)) {
      this.sessionCreatedAt.set(sessionState.sessionId, new Date().toISOString());
    }

    // Start watching for status and compaction markers
    this.statusWatcher.watchProject(sessionState.cwd);
    this.compactionWatcher.watchProject(sessionState.cwd);

    // Check for pending status updates (race condition fix)
    const pendingStatus = this.pendingStatusUpdates.get(sessionState.sessionId);
    if (pendingStatus) {
      console.log(`[STATUS] Applying queued status update for ${sessionState.sessionId.slice(0, 8)}`);
      this.pendingStatusUpdates.delete(sessionState.sessionId);
      // Use the pending status when building the session
      const session = await this.buildSession(sessionState, { fileStatus: pendingStatus.status });
      const event = operation === "insert"
        ? sessionsStateSchema.sessions.insert({ value: session })
        : sessionsStateSchema.sessions.update({ value: session });
      await this.stream.append(event);
      return;
    }

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

  // ===========================================================================
  // Public: Work Chain Management
  // ===========================================================================

  /**
   * Rename a work chain (user-defined name for session continuity).
   * Returns the sessionId of the updated session, or null if not found.
   */
  async renameWorkChain(workChainId: string, name: string | null): Promise<string | null> {
    if (this.stopping || this.paused || !this.stream) return null;

    // Store the name by work chain ID
    if (name) {
      this.workChainNames.set(workChainId, name);
    } else {
      this.workChainNames.delete(workChainId);
    }

    console.log(`[WORKCHAIN] Renamed ${workChainId.slice(0, 8)} to "${name ?? "(cleared)"}"`);

    // Find the active session in this work chain and republish it
    for (const [sessionId, sessionState] of this.sessionCache) {
      const chainId = this.sessionWorkChainId.get(sessionId);
      if (chainId === workChainId) {
        const session = await this.buildSession(sessionState);
        // Only republish the non-superseded session (the active one in the chain)
        if (!session.superseded) {
          const event = sessionsStateSchema.sessions.update({ value: session });
          await this.stream.append(event);
          return sessionId;
        }
      }
    }

    return null;
  }

  // ===========================================================================
  // Private: Work Chain Management
  // ===========================================================================

  /**
   * Get or create a work chain ID for a session.
   * Work chains persist across compaction.
   */
  private getOrCreateWorkChainId(sessionId: string): string {
    let workChainId = this.sessionWorkChainId.get(sessionId);
    if (!workChainId) {
      workChainId = crypto.randomUUID();
      this.sessionWorkChainId.set(sessionId, workChainId);
    }
    return workChainId;
  }

  /**
   * Set the work chain ID for a session (used during compaction inheritance).
   */
  private setWorkChainId(sessionId: string, workChainId: string): void {
    this.sessionWorkChainId.set(sessionId, workChainId);
  }

  // ===========================================================================
  // Private: Compaction Handling
  // ===========================================================================

  /**
   * Handle compaction event - mark only the DIRECT PREDECESSOR as superseded.
   * Called when a compaction marker file is detected.
   *
   * Key insight: Multiple terminal tabs can work on the same repo simultaneously.
   * Each tab represents a separate "work chain" - only sessions in the same
   * work chain should be superseded, not all sessions in the same cwd.
   */
  private async handleCompaction(event: CompactionEvent): Promise<void> {
    if (this.stopping || this.paused || !this.stream) return;

    const { newSessionId, cwd, compactedAt } = event;

    console.log(`[COMPACTION] Session ${newSessionId.slice(0, 8)} compacted at ${compactedAt}`);

    // Find the DIRECT predecessor (not all sessions in cwd)
    const predecessor = this.findPredecessor(newSessionId, cwd);

    if (!predecessor) {
      console.log(`[COMPACTION] No predecessor found for ${newSessionId.slice(0, 8)}`);
      return;
    }

    const [predecessorId, predecessorState] = predecessor;
    const predecessorWorkChainId = this.sessionWorkChainId.get(predecessorId);

    console.log(`[COMPACTION] Found predecessor ${predecessorId.slice(0, 8)}, workChain: ${predecessorWorkChainId?.slice(0, 8) ?? 'none'}`);

    // Inherit workChainId from predecessor to new session
    if (predecessorWorkChainId) {
      this.setWorkChainId(newSessionId, predecessorWorkChainId);
      console.log(`[COMPACTION] Inherited workChainId ${predecessorWorkChainId.slice(0, 8)} to new session`);

      // Increment compaction count for this work chain
      const currentCount = this.workChainCompactionCounts.get(predecessorWorkChainId) ?? 0;
      this.workChainCompactionCounts.set(predecessorWorkChainId, currentCount + 1);
      console.log(`[COMPACTION] Incremented compaction count to ${currentCount + 1}`);
    }

    // Inherit terminal link from predecessor (if user was in Kitty)
    const predecessorLink = this.linkRepo.get(predecessorId);
    if (predecessorLink) {
      // Update link repo to point to new session
      this.linkRepo.upsert({
        ...predecessorLink,
        sessionId: newSessionId,
        linkedAt: new Date().toISOString(),
      });
      // Remove old link
      this.linkRepo.delete(predecessorId);
      console.log(`[COMPACTION] Inherited terminal link (kitty:${predecessorLink.kittyWindowId}) to new session`);
    }

    // Only supersede the predecessor (not all sessions in cwd!)
    console.log(`[COMPACTION] Superseding predecessor ${predecessorId.slice(0, 8)}`);
    const session = await this.buildSession(predecessorState);
    session.superseded = true;
    session.supersededBy = newSessionId;
    session.supersededAt = compactedAt;

    const updateEvent = sessionsStateSchema.sessions.update({ value: session });
    await this.stream.append(updateEvent);

    // Publish the new session with inherited workChainId
    const newSessionState = this.sessionCache.get(newSessionId);
    if (newSessionState) {
      const newSession = await this.buildSession(newSessionState);
      const newSessionEvent = sessionsStateSchema.sessions.update({ value: newSession });
      await this.stream.append(newSessionEvent);
    }
  }

  /**
   * Find the direct predecessor session for compaction.
   *
   * Strategy:
   * 1. If new session has terminal context (kittyWindowId or ptyId), match it
   * 2. Otherwise, use most recently active session in same cwd (heuristic)
   *
   * Only considers non-superseded sessions.
   */
  private findPredecessor(newSessionId: string, cwd: string): [string, SessionState] | null {
    // Get new session's terminal context (may not exist yet at compaction time)
    const newLink = this.linkRepo.get(newSessionId);
    const newKittyId = newLink?.kittyWindowId;
    // Note: embeddedPty would be checked similarly if tracked

    const candidates: [string, SessionState, string][] = []; // [id, state, lastActivityAt]

    for (const [sessionId, sessionState] of this.sessionCache) {
      // Skip the new session itself
      if (sessionId === newSessionId) continue;
      // Skip sessions in different directories
      if (sessionState.cwd !== cwd) continue;
      // Skip already superseded sessions
      // (check via sessionCreatedAt existence as proxy for tracked sessions)
      // We also need to check if it's been marked superseded in a previous compaction

      // Get this session's terminal context
      const link = this.linkRepo.get(sessionId);
      const kittyId = link?.kittyWindowId;

      // Matching logic:
      // If new session has a kitty link, only consider sessions with SAME kitty link
      // If new session has no link yet, consider ALL sessions (will pick most recent)
      if (newKittyId !== undefined) {
        // New session has kitty context - only match same kitty window
        if (kittyId === newKittyId) {
          candidates.push([sessionId, sessionState, sessionState.status.lastActivityAt]);
        }
      } else {
        // No terminal context yet - include all candidates
        candidates.push([sessionId, sessionState, sessionState.status.lastActivityAt]);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by lastActivityAt descending (most recent first)
    candidates.sort((a, b) =>
      new Date(b[2]).getTime() - new Date(a[2]).getTime()
    );

    // Return the most recently active session
    return [candidates[0][0], candidates[0][1]];
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

