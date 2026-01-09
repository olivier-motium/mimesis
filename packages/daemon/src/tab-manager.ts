/**
 * Tab Manager - manages stable terminal tabs and their segment chains.
 *
 * Implements the "kitty effect" where compaction rotates sessions within
 * a stable UI tab rather than creating new tabs.
 *
 * Core concept: TerminalTab → ClaudeSegment[] (1:many) instead of Tab → Session (1:1)
 *
 * A TerminalTab is a stable UI entity that persists across:
 * - Session compaction (/compact)
 * - Session clear (/clear)
 * - Resume operations (--resume)
 *
 * Each tab contains an append-only chain of segments, where each segment
 * represents one Claude Code session within that tab.
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { TerminalTab, ClaudeSegment, SegmentReason, CompactTrigger } from "./schema.js";

/** Events emitted by TabManager */
export interface TabManagerEvents {
  /** Emitted when a new segment is appended (compaction, clear, resume) */
  segmentRotated: {
    tabId: string;
    segment: ClaudeSegment;
    previousSessionId: string | null;
  };
  /** Emitted when a tab is created */
  tabCreated: {
    tab: TerminalTab;
  };
  /** Emitted when a tab is destroyed */
  tabDestroyed: {
    tabId: string;
  };
  /** Emitted when segment is marked as ending (pre-compact) */
  segmentEnding: {
    tabId: string;
    sessionId: string;
  };
}

/**
 * Manages terminal tabs and their segment chains.
 *
 * Tab lifecycle:
 * 1. createTab() - UI creates stable tab when user opens embedded terminal
 * 2. appendSegment() - Called on SessionStart (startup/resume/compact/clear)
 * 3. markSegmentEnding() - Called on PreCompact (optional prep work)
 * 4. destroyTab() - Tab closed by user
 *
 * The PTY stream remains continuous across segment rotations - only the
 * underlying Claude session changes.
 */
export class TabManager extends EventEmitter {
  /** Active tabs by tab ID */
  private tabs = new Map<string, TerminalTab>();

  /** Index from session ID to tab ID for fast lookup */
  private sessionToTab = new Map<string, string>();

  /**
   * Create a new terminal tab.
   *
   * Called by UI when opening an embedded terminal. The returned tabId
   * is injected into the PTY environment as COMMAND_CENTER_TAB_ID.
   */
  createTab(repoRoot: string): TerminalTab {
    const now = new Date().toISOString();

    const tab: TerminalTab = {
      tabId: randomUUID(),
      repoRoot,
      segments: [],
      activeSegmentIndex: -1,
      createdAt: now,
      lastActivityAt: now,
    };

    this.tabs.set(tab.tabId, tab);

    this.emit("tabCreated", { tab });

    console.log(`[TabManager] Created tab ${tab.tabId} for ${repoRoot}`);

    return tab;
  }

  /**
   * Append a new segment to a tab.
   *
   * Called when:
   * - New session starts in a tab (reason: "startup")
   * - Session resumed via --resume (reason: "resume")
   * - Session compacted (reason: "compact")
   * - Session cleared via /clear (reason: "clear")
   *
   * The previous segment (if any) is automatically closed.
   */
  appendSegment(
    tabId: string,
    params: {
      sessionId: string;
      transcriptPath: string;
      reason: SegmentReason;
      trigger?: CompactTrigger;
    }
  ): ClaudeSegment | null {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      console.warn(`[TabManager] appendSegment: tab ${tabId} not found`);
      return null;
    }

    const now = new Date().toISOString();

    // Close previous segment if one exists
    let previousSessionId: string | null = null;
    if (tab.activeSegmentIndex >= 0) {
      const previousSegment = tab.segments[tab.activeSegmentIndex];
      previousSegment.endedAt = now;
      previousSessionId = previousSegment.sessionId;

      // Remove old session from index
      this.sessionToTab.delete(previousSegment.sessionId);
    }

    // Create new segment
    const segment: ClaudeSegment = {
      sessionId: params.sessionId,
      transcriptPath: params.transcriptPath,
      startedAt: now,
      reason: params.reason,
      trigger: params.trigger,
    };

    // Append to chain
    tab.segments.push(segment);
    tab.activeSegmentIndex = tab.segments.length - 1;
    tab.lastActivityAt = now;

    // Update index
    this.sessionToTab.set(params.sessionId, tabId);

    // Emit event for UI
    this.emit("segmentRotated", {
      tabId,
      segment,
      previousSessionId,
    });

    console.log(
      `[TabManager] Appended segment ${params.sessionId} to tab ${tabId} ` +
        `(reason=${params.reason}, previous=${previousSessionId ?? "none"})`
    );

    return segment;
  }

  /**
   * Mark a segment as ending.
   *
   * Called on PreCompact hook - allows prep work before compaction.
   * The segment isn't actually closed until the new session starts.
   */
  markSegmentEnding(tabId: string, sessionId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      console.warn(`[TabManager] markSegmentEnding: tab ${tabId} not found`);
      return;
    }

    // Verify the session belongs to this tab
    const activeSegment = tab.segments[tab.activeSegmentIndex];
    if (!activeSegment || activeSegment.sessionId !== sessionId) {
      console.warn(
        `[TabManager] markSegmentEnding: session ${sessionId} is not active in tab ${tabId}`
      );
      return;
    }

    this.emit("segmentEnding", { tabId, sessionId });

    console.log(
      `[TabManager] Marked segment ${sessionId} as ending in tab ${tabId}`
    );
  }

  /**
   * Get a tab by its ID.
   */
  getTab(tabId: string): TerminalTab | undefined {
    return this.tabs.get(tabId);
  }

  /**
   * Get a tab by a session ID (any segment, not just active).
   *
   * Useful for finding which tab a session belongs to during hook processing.
   */
  getTabBySessionId(sessionId: string): TerminalTab | undefined {
    // First check fast index
    const tabId = this.sessionToTab.get(sessionId);
    if (tabId) {
      return this.tabs.get(tabId);
    }

    // Fallback: scan all tabs for historical segments
    for (const tab of this.tabs.values()) {
      if (tab.segments.some((s) => s.sessionId === sessionId)) {
        // Update index for future lookups
        this.sessionToTab.set(sessionId, tab.tabId);
        return tab;
      }
    }

    return undefined;
  }

  /**
   * Get the active segment for a tab.
   */
  getActiveSegment(tabId: string): ClaudeSegment | undefined {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.activeSegmentIndex < 0) {
      return undefined;
    }
    return tab.segments[tab.activeSegmentIndex];
  }

  /**
   * Update the PTY ID for a tab.
   *
   * Called when a PTY is spawned for an existing tab.
   */
  setPtyId(tabId: string, ptyId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return false;
    }

    tab.ptyId = ptyId;
    tab.lastActivityAt = new Date().toISOString();

    return true;
  }

  /**
   * Clear the PTY ID for a tab.
   *
   * Called when PTY is destroyed but tab should persist.
   */
  clearPtyId(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.ptyId = undefined;
    }
  }

  /**
   * Destroy a tab and all its segments.
   *
   * Called when user closes the tab in UI.
   */
  destroyTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return false;
    }

    // Clean up session index entries
    for (const segment of tab.segments) {
      this.sessionToTab.delete(segment.sessionId);
    }

    this.tabs.delete(tabId);

    this.emit("tabDestroyed", { tabId });

    console.log(`[TabManager] Destroyed tab ${tabId}`);

    return true;
  }

  /**
   * Get all active tabs.
   */
  getAllTabs(): TerminalTab[] {
    return Array.from(this.tabs.values());
  }

  /**
   * Get tabs for a specific repo root.
   */
  getTabsByRepoRoot(repoRoot: string): TerminalTab[] {
    return Array.from(this.tabs.values()).filter(
      (tab) => tab.repoRoot === repoRoot
    );
  }

  /**
   * Get all segments across all tabs (for history/search).
   */
  getAllSegments(): Array<ClaudeSegment & { tabId: string }> {
    const result: Array<ClaudeSegment & { tabId: string }> = [];
    for (const tab of this.tabs.values()) {
      for (const segment of tab.segments) {
        result.push({ ...segment, tabId: tab.tabId });
      }
    }
    return result;
  }

  /**
   * Get segment count across all tabs.
   */
  getTotalSegmentCount(): number {
    let count = 0;
    for (const tab of this.tabs.values()) {
      count += tab.segments.length;
    }
    return count;
  }
}

/** Singleton tab manager instance */
export const tabManager = new TabManager();
