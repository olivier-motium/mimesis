/**
 * Session Store - Unified session tracking for the Gateway.
 *
 * Merges sessions from two sources:
 * 1. SessionWatcher: Detects external Claude Code sessions via JSONL files
 * 2. PtyBridge: Sessions spawned by the Gateway itself
 *
 * Also integrates status updates from StatusWatcher (file-based status).
 */

import type { StatusResult, LogEntry } from "../types.js";
import type { FileStatus } from "../schema.js";

// =============================================================================
// Types
// =============================================================================

export type SessionSource = "watcher" | "pty";
export type UIStatus = "working" | "waiting" | "idle";

/**
 * Tracked session - unified representation for UI consumption.
 */
export interface TrackedSession {
  sessionId: string;
  projectId?: string;
  cwd: string;
  status: UIStatus;
  source: SessionSource;
  lastActivityAt: string;
  createdAt: string;

  // From watcher metadata
  gitBranch?: string | null;
  gitRepoUrl?: string | null;
  originalPrompt?: string | null;

  // From status file (via StatusWatcher)
  fileStatus?: FileStatus | null;

  // PTY-specific
  pid?: number;

  // Conversation entries (for watcher sessions - enables full chat display)
  entries?: LogEntry[];
}

/**
 * Session data from SessionWatcher.
 */
export interface WatcherSessionData {
  sessionId: string;
  cwd: string;
  status: StatusResult;
  gitBranch?: string | null;
  gitRepoUrl?: string | null;
  originalPrompt?: string | null;
  startedAt?: string;
  entries?: LogEntry[];
}

/**
 * Session data from PtyBridge.
 */
export interface PtySessionData {
  sessionId: string;
  projectId: string;
  cwd: string;
  pid: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map StatusResult to UI status.
 * StatusResult.status is already "working" | "waiting" | "idle".
 */
function mapStatusToUI(status: StatusResult): UIStatus {
  // StatusResult.status is already normalized to UI status values
  return status.status;
}

// =============================================================================
// SessionStore Class
// =============================================================================

export class SessionStore {
  private sessions = new Map<string, TrackedSession>();
  private listeners = new Set<(event: SessionStoreEvent) => void>();

  /**
   * Add or update a session from SessionWatcher.
   */
  addFromWatcher(data: WatcherSessionData): void {
    const existing = this.sessions.get(data.sessionId);

    const session: TrackedSession = {
      sessionId: data.sessionId,
      cwd: data.cwd,
      status: mapStatusToUI(data.status),
      source: existing?.source ?? "watcher",
      lastActivityAt: data.status.lastActivityAt,
      createdAt: existing?.createdAt ?? data.startedAt ?? new Date().toISOString(),
      gitBranch: data.gitBranch,
      gitRepoUrl: data.gitRepoUrl,
      originalPrompt: data.originalPrompt,
      fileStatus: existing?.fileStatus,
      projectId: existing?.projectId,
      pid: existing?.pid,
      // Store entries for full chat history display
      entries: data.entries,
    };

    const isNew = !existing;
    this.sessions.set(data.sessionId, session);

    if (isNew) {
      this.emit({ type: "discovered", session });
    } else {
      this.emit({ type: "updated", sessionId: data.sessionId, updates: session });
    }
  }

  /**
   * Add or update a session from PtyBridge.
   */
  addFromPty(data: PtySessionData): void {
    const existing = this.sessions.get(data.sessionId);

    const session: TrackedSession = {
      sessionId: data.sessionId,
      projectId: data.projectId,
      cwd: data.cwd,
      status: "working", // PTY sessions start as working
      source: "pty",
      lastActivityAt: new Date().toISOString(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      pid: data.pid,
      // Preserve watcher data if this session was discovered first
      gitBranch: existing?.gitBranch,
      gitRepoUrl: existing?.gitRepoUrl,
      originalPrompt: existing?.originalPrompt,
      fileStatus: existing?.fileStatus,
    };

    const isNew = !existing;
    this.sessions.set(data.sessionId, session);

    if (isNew) {
      this.emit({ type: "discovered", session });
    } else {
      this.emit({ type: "updated", sessionId: data.sessionId, updates: session });
    }
  }

  /**
   * Update session status from StatusWatcher.
   */
  updateFileStatus(sessionId: string, fileStatus: FileStatus | null): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Session not tracked yet - might be discovered later
      return;
    }

    // Update file status
    session.fileStatus = fileStatus;
    session.lastActivityAt = new Date().toISOString();

    // Update UI status based on file status if present
    if (fileStatus?.status) {
      const statusMap: Record<string, UIStatus> = {
        working: "working",
        waiting_for_approval: "waiting",
        waiting_for_input: "waiting",
        completed: "idle",
        error: "idle",
        blocked: "waiting",
        idle: "idle",
      };
      session.status = statusMap[fileStatus.status] ?? session.status;
    }

    this.emit({
      type: "updated",
      sessionId,
      updates: {
        fileStatus,
        status: session.status,
        lastActivityAt: session.lastActivityAt,
      },
    });
  }

  /**
   * Update session status (e.g., from PTY activity inference).
   */
  updateStatus(sessionId: string, status: UIStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    session.lastActivityAt = new Date().toISOString();

    this.emit({
      type: "updated",
      sessionId,
      updates: { status, lastActivityAt: session.lastActivityAt },
    });
  }

  /**
   * Remove a session.
   */
  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);
    this.emit({ type: "removed", sessionId });
  }

  /**
   * Get a session by ID.
   */
  get(sessionId: string): TrackedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions.
   */
  getAll(): TrackedSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Subscribe to session store events.
   */
  subscribe(listener: (event: SessionStoreEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners.
   */
  private emit(event: SessionStoreEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[SESSION_STORE] Listener error:", error);
      }
    }
  }
}

// =============================================================================
// Event Types
// =============================================================================

export type SessionStoreEvent =
  | SessionDiscoveredEvent
  | SessionUpdatedEvent
  | SessionRemovedEvent;

export interface SessionDiscoveredEvent {
  type: "discovered";
  session: TrackedSession;
}

export interface SessionUpdatedEvent {
  type: "updated";
  sessionId: string;
  updates: Partial<TrackedSession>;
}

export interface SessionRemovedEvent {
  type: "removed";
  sessionId: string;
}
