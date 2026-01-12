import { watch, type FSWatcher } from "chokidar";
import { unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  tailJSONL,
  extractMetadata,
  extractSessionId,
  extractEncodedDir,
} from "./parser.js";
import { deriveStatus, statusChanged } from "./status-derivation.js";
import { getGitInfoCached, type GitInfo } from "./git.js";
import type { LogEntry, SessionMetadata, StatusResult, SessionStateInternal } from "./types.js";
import { MAX_ENTRIES_PER_SESSION } from "./config/index.js";
import {
  withSpan,
  addSessionAttributes,
  recordError as recordSpanError,
} from "./telemetry/spans.js";
import {
  recordSessionActive,
  recordParseTime,
  recordError as recordErrorMetric,
} from "./telemetry/metrics.js";

const DEFAULT_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

/**
 * Resolve git info for a session - reuses cached info for existing sessions.
 */
async function resolveSessionGitInfo(
  existingSession: SessionState | undefined,
  cwd: string
): Promise<GitInfo> {
  if (existingSession) {
    return {
      repoUrl: existingSession.gitRepoUrl,
      repoId: existingSession.gitRepoId,
      branch: existingSession.gitBranch,
      isGitRepo: existingSession.gitRepoUrl !== null || existingSession.gitBranch !== null,
    };
  }
  return getGitInfoCached(cwd);
}

/**
 * Build session state from components.
 */
function buildSessionState(params: {
  sessionId: string;
  filepath: string;
  metadata: SessionMetadata;
  gitInfo: GitInfo;
  status: StatusResult;
  entries: LogEntry[];
  bytePosition: number;
}): SessionState {
  const { sessionId, filepath, metadata, gitInfo, status, entries, bytePosition } = params;
  return {
    sessionId,
    filepath,
    encodedDir: extractEncodedDir(filepath),
    cwd: metadata.cwd,
    gitBranch: gitInfo.branch || metadata.gitBranch,
    originalPrompt: metadata.originalPrompt,
    startedAt: metadata.startedAt,
    status,
    entries,
    bytePosition,
    gitRepoUrl: gitInfo.repoUrl,
    gitRepoId: gitInfo.repoId,
  };
}

/**
 * SessionState includes all fields needed by the watcher.
 * For consumers that only need public fields, use SessionStatePublic from types.js.
 */
export type SessionState = SessionStateInternal;

// Re-export public interface for consumers that don't need internal fields
export type { SessionStatePublic } from "./types.js";

export interface SessionEvent {
  type: "created" | "updated" | "deleted";
  session: SessionState;
  previousStatus?: StatusResult;
}

export class SessionWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private sessions = new Map<string, SessionState>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private debounceMs: number;
  private projectsDir: string;

  constructor(options: { debounceMs?: number; projectsDir?: string } = {}) {
    super();
    this.debounceMs = options.debounceMs ?? 200;
    this.projectsDir = options.projectsDir ?? DEFAULT_PROJECTS_DIR;
  }

  async start(): Promise<void> {
    // Use directory watching instead of glob - chokidar has issues with
    // directories that start with dashes when using glob patterns
    this.watcher = watch(this.projectsDir, {
      ignored: /agent-.*\.jsonl$/,  // Ignore agent sub-session files
      persistent: true,
      ignoreInitial: false,
      depth: 2,
    });

    this.watcher
      .on("add", (path) => {
        if (!path.endsWith(".jsonl")) return;
        this.handleFile(path, "add");
      })
      .on("change", (path) => {
        if (!path.endsWith(".jsonl")) return;
        this.debouncedHandleFile(path);
      })
      .on("unlink", (path) => this.handleDelete(path))
      .on("error", (error) => this.emit("error", error));

    // Wait for initial scan to complete
    await new Promise<void>((resolve) => {
      this.watcher!.on("ready", resolve);
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  getSessions(): Map<string, SessionState> {
    return this.sessions;
  }

  /**
   * Delete a session permanently - removes from memory and deletes the JSONL file.
   * Returns true if session was found and deleted, false if not found.
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Delete the JSONL file from disk
      unlinkSync(session.filepath);
    } catch (error) {
      // File may already be deleted, continue with cleanup
      console.warn(`[WATCHER] Could not delete file ${session.filepath}:`, error);
    }

    // Remove from memory
    this.sessions.delete(sessionId);

    // Clear any pending debounce timer for this file
    const timer = this.debounceTimers.get(session.filepath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(session.filepath);
    }

    // Emit delete event so stream gets updated
    this.emit("session", {
      type: "deleted",
      session,
    } satisfies SessionEvent);

    return true;
  }

  private debouncedHandleFile(filepath: string): void {
    // Clear existing timer for this file
    const existing = this.debounceTimers.get(filepath);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filepath);
      this.handleFile(filepath, "change");
    }, this.debounceMs);

    this.debounceTimers.set(filepath, timer);
  }

  private async handleFile(
    filepath: string,
    _eventType: "add" | "change"
  ): Promise<void> {
    const startTime = performance.now();

    try {
      const sessionId = extractSessionId(filepath);
      const existingSession = this.sessions.get(sessionId);

      // Read new entries from file
      const fromByte = existingSession?.bytePosition ?? 0;
      const { entries: newEntries, newPosition } = await tailJSONL(filepath, fromByte);

      // Record parse time metric
      const parseTimeMs = performance.now() - startTime;
      recordParseTime(parseTimeMs, { session_id: sessionId });

      if (newEntries.length === 0 && existingSession) {
        return; // No new data
      }

      // Combine with existing entries, trimming to prevent memory leaks
      const combinedEntries = existingSession
        ? [...existingSession.entries, ...newEntries]
        : newEntries;

      // Trim to last N entries to prevent unbounded memory growth
      const allEntries = combinedEntries.length > MAX_ENTRIES_PER_SESSION
        ? combinedEntries.slice(-MAX_ENTRIES_PER_SESSION)
        : combinedEntries;

      // Extract metadata for new sessions
      const metadata = existingSession
        ? {
            sessionId: existingSession.sessionId,
            cwd: existingSession.cwd,
            gitBranch: existingSession.gitBranch,
            originalPrompt: existingSession.originalPrompt,
            startedAt: existingSession.startedAt,
          }
        : extractMetadata(allEntries);

      if (!metadata) {
        return; // Not enough data yet
      }

      // Resolve git info (cached for existing sessions)
      const gitInfo = await resolveSessionGitInfo(existingSession, metadata.cwd);

      // Derive status and build session state
      const status = deriveStatus(allEntries);
      const previousStatus = existingSession?.status;

      const session = buildSessionState({
        sessionId,
        filepath,
        metadata,
        gitInfo,
        status,
        entries: allEntries,
        bytePosition: newPosition,
      });

      // Re-check if session was added by concurrent call (race condition guard)
      const currentSession = this.sessions.get(sessionId);
      const isNew = !currentSession;

      // Store session
      this.sessions.set(sessionId, session);

      // Update session count metric
      recordSessionActive(this.sessions.size);

      // Emit event
      const hasStatusChange = statusChanged(previousStatus, status);
      const hasNewMessages = currentSession && status.messageCount > currentSession.status.messageCount;

      if (isNew) {
        this.emit("session", {
          type: "created",
          session,
        } satisfies SessionEvent);
      } else if (hasStatusChange || hasNewMessages) {
        this.emit("session", {
          type: "updated",
          session,
          previousStatus,
        } satisfies SessionEvent);
      }
    } catch (error) {
      // ENOENT = file was deleted between event firing and read attempt
      // This is expected during rapid file changes (e.g., tests cleanup)
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return; // File gone, nothing to do
      }
      recordErrorMetric("watcher_file_error");
      this.emit("error", error);
    }
  }

  private handleDelete(filepath: string): void {
    const sessionId = extractSessionId(filepath);
    const session = this.sessions.get(sessionId);

    if (session) {
      this.sessions.delete(sessionId);

      // Update session count metric
      recordSessionActive(this.sessions.size);

      this.emit("session", {
        type: "deleted",
        session,
      } satisfies SessionEvent);
    }
  }
}
