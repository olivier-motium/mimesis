/**
 * Watches .claude/status.*.md files across project directories.
 * Parses YAML frontmatter and emits status updates.
 *
 * Supports both:
 * - Session-specific files: status.<sessionId>.md (preferred)
 * - Legacy project-level: status.md (fallback)
 */

import { watch, type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseStatusFile, isStatusStale, type ParsedStatus } from "./status-parser.js";
import { STATUS_FILE_TTL_MS, STATUS_DIR, STATUS_FILENAME, STATUS_FILE_PATTERN } from "./config/index.js";
import type { FileStatus } from "./schema.js";

// =============================================================================
// Types
// =============================================================================

export interface StatusUpdateEvent {
  sessionId: string;  // Session ID (from filename or legacy)
  cwd: string;        // Project directory (for legacy fallback matching)
  status: FileStatus | null; // null if file was deleted or is stale
}

// =============================================================================
// StatusWatcher Class
// =============================================================================

export class StatusWatcher extends EventEmitter {
  private watchers = new Map<string, FSWatcher>();
  // Cache by sessionId for session-specific files
  private statusCacheBySessionId = new Map<string, FileStatus>();
  // Cache by cwd for legacy files (for getStatus fallback)
  private statusCacheByCwd = new Map<string, FileStatus>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private debounceMs: number;

  constructor(options: { debounceMs?: number } = {}) {
    super();
    this.debounceMs = options.debounceMs ?? 100;
  }

  /**
   * Start watching a project directory for status file changes.
   * Call this when a new session is discovered.
   * Returns a promise that resolves when initial scan is complete.
   */
  watchProject(cwd: string): void {
    // Already watching this directory
    if (this.watchers.has(cwd)) {
      return;
    }

    const statusDir = path.join(cwd, STATUS_DIR);

    // Watch the .claude directory to catch all status files
    // Use ignoreInitial: true so we can control initial scan ourselves
    const watcher = watch(statusDir, {
      persistent: true,
      ignoreInitial: true,  // We'll scan manually after watcher is ready
      depth: 0,
    });

    watcher
      .on("add", (filepath) => {
        if (this.isStatusFile(filepath)) {
          this.handleStatusFile(cwd, filepath);
        }
      })
      .on("change", (filepath) => {
        if (this.isStatusFile(filepath)) {
          this.debouncedHandleFile(cwd, filepath);
        }
      })
      .on("unlink", (filepath) => {
        if (this.isStatusFile(filepath)) {
          this.handleDelete(cwd, filepath);
        }
      })
      .on("error", (error) => this.emit("error", error))
      .on("ready", () => {
        // Process existing status files after watcher is ready
        this.scanExistingStatusFiles(cwd, statusDir);
      });

    this.watchers.set(cwd, watcher);
  }

  /**
   * Scan existing status files in a directory.
   * Called after watcher is ready.
   */
  private async scanExistingStatusFiles(cwd: string, statusDir: string): Promise<void> {
    if (!existsSync(statusDir)) {
      return;
    }

    try {
      const files = readdirSync(statusDir);
      for (const file of files) {
        const filepath = path.join(statusDir, file);
        if (this.isStatusFile(filepath)) {
          await this.handleStatusFile(cwd, filepath);  // Now awaited!
        }
      }
    } catch {
      // Directory might not exist or be unreadable
    }
  }

  /**
   * Check if a file path is a status file (session-specific or legacy).
   */
  private isStatusFile(filepath: string): boolean {
    const filename = path.basename(filepath);
    // Match session-specific: status.<sessionId>.md
    if (STATUS_FILE_PATTERN.test(filename)) {
      return true;
    }
    // Match legacy: status.md
    return filename === STATUS_FILENAME;
  }

  /**
   * Extract session ID from a status filename.
   * Returns null for legacy status.md files.
   */
  private extractSessionId(filepath: string): string | null {
    const filename = path.basename(filepath);
    const match = filename.match(STATUS_FILE_PATTERN);
    if (match) {
      return match[1];
    }
    return null; // Legacy file
  }

  /**
   * Stop watching a project directory.
   */
  unwatchProject(cwd: string): void {
    const watcher = this.watchers.get(cwd);
    if (watcher) {
      watcher.close();
      this.watchers.delete(cwd);
    }

    // Clear debounce timers for this cwd
    for (const [key, timer] of this.debounceTimers) {
      if (key.startsWith(cwd)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }

    // Remove legacy cache entry
    this.statusCacheByCwd.delete(cwd);
  }

  /**
   * Stop all watchers.
   */
  stop(): void {
    for (const cwd of this.watchers.keys()) {
      this.unwatchProject(cwd);
    }
  }

  /**
   * Get current status for a session by ID.
   * Returns null if no status file or if stale.
   */
  getStatusBySessionId(sessionId: string): FileStatus | null {
    const cached = this.statusCacheBySessionId.get(sessionId);
    if (!cached) {
      return null;
    }

    // Check if stale
    if (isStatusStale(cached.updated, STATUS_FILE_TTL_MS)) {
      this.statusCacheBySessionId.delete(sessionId);
      return null;
    }

    return cached;
  }

  /**
   * Get current status for a project (legacy fallback).
   * Returns null if no status file or if stale.
   */
  getStatus(cwd: string): FileStatus | null {
    const cached = this.statusCacheByCwd.get(cwd);
    if (!cached) {
      return null;
    }

    // Check if stale
    if (isStatusStale(cached.updated, STATUS_FILE_TTL_MS)) {
      this.statusCacheByCwd.delete(cwd);
      return null;
    }

    return cached;
  }

  /**
   * Refresh status for a session from disk.
   * Useful when you need the latest status synchronously.
   */
  async refreshStatusBySessionId(sessionId: string, cwd: string): Promise<FileStatus | null> {
    // Try session-specific file first
    const sessionStatusPath = path.join(cwd, STATUS_DIR, `status.${sessionId}.md`);
    if (existsSync(sessionStatusPath)) {
      return this.readAndCacheStatus(sessionStatusPath, sessionId, cwd);
    }

    // Fall back to legacy
    const legacyStatusPath = path.join(cwd, STATUS_DIR, STATUS_FILENAME);
    if (existsSync(legacyStatusPath)) {
      return this.readAndCacheStatus(legacyStatusPath, null, cwd);
    }

    return null;
  }

  /**
   * Refresh status for a project (legacy).
   */
  async refreshStatus(cwd: string): Promise<FileStatus | null> {
    const statusFilePath = path.join(cwd, STATUS_DIR, STATUS_FILENAME);

    if (!existsSync(statusFilePath)) {
      this.statusCacheByCwd.delete(cwd);
      return null;
    }

    return this.readAndCacheStatus(statusFilePath, null, cwd);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async readAndCacheStatus(
    filepath: string,
    sessionId: string | null,
    cwd: string
  ): Promise<FileStatus | null> {
    try {
      const content = await readFile(filepath, "utf-8");
      const parsed = parseStatusFile(content);

      if (!parsed) {
        return null;
      }

      // Check staleness
      if (isStatusStale(parsed.frontmatter.updated, STATUS_FILE_TTL_MS)) {
        return null;
      }

      const fileStatus = this.parsedToFileStatus(parsed);

      // Cache appropriately
      if (sessionId) {
        this.statusCacheBySessionId.set(sessionId, fileStatus);
      } else {
        this.statusCacheByCwd.set(cwd, fileStatus);
      }

      return fileStatus;
    } catch {
      return null;
    }
  }

  private debouncedHandleFile(cwd: string, filepath: string): void {
    const key = filepath; // Use full path as key for debouncing
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.handleStatusFile(cwd, filepath);
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  private async handleStatusFile(cwd: string, filepath: string): Promise<void> {
    try {
      const content = await readFile(filepath, "utf-8");
      const parsed = parseStatusFile(content);
      const sessionId = this.extractSessionId(filepath);

      if (!parsed) {
        // Invalid file format - emit null status
        if (sessionId) {
          this.statusCacheBySessionId.delete(sessionId);
        } else {
          this.statusCacheByCwd.delete(cwd);
        }
        this.emit("status", {
          sessionId: sessionId ?? `legacy:${cwd}`,
          cwd,
          status: null,
        } satisfies StatusUpdateEvent);
        return;
      }

      // Check staleness
      if (isStatusStale(parsed.frontmatter.updated, STATUS_FILE_TTL_MS)) {
        if (sessionId) {
          this.statusCacheBySessionId.delete(sessionId);
        } else {
          this.statusCacheByCwd.delete(cwd);
        }
        this.emit("status", {
          sessionId: sessionId ?? `legacy:${cwd}`,
          cwd,
          status: null,
        } satisfies StatusUpdateEvent);
        return;
      }

      const fileStatus = this.parsedToFileStatus(parsed);

      // Cache appropriately
      if (sessionId) {
        this.statusCacheBySessionId.set(sessionId, fileStatus);
      } else {
        this.statusCacheByCwd.set(cwd, fileStatus);
      }

      this.emit("status", {
        sessionId: sessionId ?? `legacy:${cwd}`,
        cwd,
        status: fileStatus,
      } satisfies StatusUpdateEvent);
    } catch (error) {
      this.emit("error", error);
    }
  }

  private handleDelete(cwd: string, filepath: string): void {
    const sessionId = this.extractSessionId(filepath);

    if (sessionId) {
      this.statusCacheBySessionId.delete(sessionId);
    } else {
      this.statusCacheByCwd.delete(cwd);
    }

    this.emit("status", {
      sessionId: sessionId ?? `legacy:${cwd}`,
      cwd,
      status: null,
    } satisfies StatusUpdateEvent);
  }

  private parsedToFileStatus(parsed: ParsedStatus): FileStatus {
    return {
      status: parsed.frontmatter.status,
      updated: parsed.frontmatter.updated,
      task: parsed.frontmatter.task,
      summary: parsed.summary,
      blockers: parsed.blockers,
      nextSteps: parsed.nextSteps,
    };
  }
}
