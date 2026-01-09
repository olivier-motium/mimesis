/**
 * Watches .claude/compacted.*.marker files across project directories.
 * These marker files are created by the session-compact hook when
 * a session is compacted, signaling that older sessions should be superseded.
 */

import { watch, type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import { readFile, unlink } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { STATUS_DIR } from "./config/index.js";

// =============================================================================
// Types
// =============================================================================

export interface CompactionEvent {
  newSessionId: string;
  cwd: string;
  compactedAt: string;
}

// Pattern to match compaction marker files: compacted.<sessionId>.marker
const COMPACTION_MARKER_PATTERN = /^compacted\.(.+)\.marker$/;

// =============================================================================
// CompactionWatcher Class
// =============================================================================

export class CompactionWatcher extends EventEmitter {
  private watchers = new Map<string, FSWatcher>();
  private processedMarkers = new Set<string>();

  /**
   * Start watching a project directory for compaction marker files.
   * Call this when a new session is discovered.
   */
  watchProject(cwd: string): void {
    // Already watching this directory
    if (this.watchers.has(cwd)) {
      return;
    }

    const claudeDir = path.join(cwd, STATUS_DIR);

    // Watch the .claude directory for marker files
    const watcher = watch(claudeDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 0,
    });

    watcher
      .on("add", (filepath) => {
        if (this.isMarkerFile(filepath)) {
          this.handleMarkerFile(filepath);
        }
      })
      .on("error", (error) => this.emit("error", error));

    this.watchers.set(cwd, watcher);

    // Check for existing marker files (in case daemon restarted)
    if (existsSync(claudeDir)) {
      try {
        const files = readdirSync(claudeDir);
        for (const file of files) {
          const filepath = path.join(claudeDir, file);
          if (this.isMarkerFile(filepath)) {
            this.handleMarkerFile(filepath);
          }
        }
      } catch {
        // Directory might not exist or be unreadable
      }
    }
  }

  /**
   * Check if a file path is a compaction marker file.
   */
  private isMarkerFile(filepath: string): boolean {
    const filename = path.basename(filepath);
    return COMPACTION_MARKER_PATTERN.test(filename);
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
  }

  /**
   * Stop all watchers.
   */
  stop(): void {
    for (const cwd of this.watchers.keys()) {
      this.unwatchProject(cwd);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async handleMarkerFile(filepath: string): Promise<void> {
    // Avoid processing the same marker twice
    if (this.processedMarkers.has(filepath)) {
      return;
    }

    try {
      const content = await readFile(filepath, "utf-8");
      const event: CompactionEvent = JSON.parse(content);

      // Mark as processed before emitting to prevent double-processing
      this.processedMarkers.add(filepath);

      // Emit compaction event
      this.emit("compaction", event);

      // Clean up marker file after processing
      await unlink(filepath).catch(() => {
        // Ignore errors if file was already deleted
      });

      // Clear from processed set after a delay (in case file is recreated)
      setTimeout(() => {
        this.processedMarkers.delete(filepath);
      }, 60000);
    } catch (error) {
      console.error("[CompactionWatcher] Error processing marker file:", error);
    }
  }
}
