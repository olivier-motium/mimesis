/**
 * React hooks for managing terminal tabs (segment rotation).
 *
 * These hooks provide a stable tab abstraction over Claude Code sessions,
 * enabling the "kitty effect" where compaction is invisible to the user.
 *
 * Usage:
 * 1. Call useTabManager() to get tab management functions
 * 2. When opening an embedded terminal, call createOrGetTab(repoRoot)
 * 3. Pass the returned tabId to createPty()
 * 4. The tab persists across session compaction
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { TerminalTab, ClaudeSegment } from "../lib/api";
import * as api from "../lib/api";

/** State for tab management */
interface TabState {
  tabs: Map<string, TerminalTab>;
  tabsByRepo: Map<string, string[]>; // repoRoot -> tabIds
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for managing terminal tabs.
 *
 * Returns functions to:
 * - Create new tabs
 * - Get existing tabs for a repo
 * - Get tab by ID
 * - Delete tabs
 * - Refresh tab state from server
 */
export function useTabManager() {
  const [state, setState] = useState<TabState>({
    tabs: new Map(),
    tabsByRepo: new Map(),
    isLoading: true,
    error: null,
  });

  // Load initial tabs from server
  useEffect(() => {
    loadTabs();
  }, []);

  const loadTabs = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await api.getTabs();
      const tabs = new Map<string, TerminalTab>();
      const tabsByRepo = new Map<string, string[]>();

      for (const tab of response.tabs) {
        tabs.set(tab.tabId, tab);

        // Index by repo
        const existing = tabsByRepo.get(tab.repoRoot) ?? [];
        existing.push(tab.tabId);
        tabsByRepo.set(tab.repoRoot, existing);
      }

      setState({
        tabs,
        tabsByRepo,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load tabs";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, []);

  const createTab = useCallback(async (repoRoot: string): Promise<TerminalTab> => {
    const response = await api.createTab(repoRoot);
    const tab = response.tab;

    setState((prev) => {
      const tabs = new Map(prev.tabs);
      tabs.set(tab.tabId, tab);

      const tabsByRepo = new Map(prev.tabsByRepo);
      const existing = tabsByRepo.get(tab.repoRoot) ?? [];
      existing.push(tab.tabId);
      tabsByRepo.set(tab.repoRoot, existing);

      return { ...prev, tabs, tabsByRepo };
    });

    return tab;
  }, []);

  const getTab = useCallback(
    (tabId: string): TerminalTab | undefined => {
      return state.tabs.get(tabId);
    },
    [state.tabs]
  );

  const getTabsForRepo = useCallback(
    (repoRoot: string): TerminalTab[] => {
      const tabIds = state.tabsByRepo.get(repoRoot) ?? [];
      return tabIds
        .map((id) => state.tabs.get(id))
        .filter((tab): tab is TerminalTab => tab !== undefined);
    },
    [state.tabs, state.tabsByRepo]
  );

  /**
   * Get or create a tab for a repo.
   * Returns an existing tab if one exists, otherwise creates a new one.
   */
  const createOrGetTab = useCallback(
    async (repoRoot: string): Promise<TerminalTab> => {
      // Check for existing tab
      const existingTabs = getTabsForRepo(repoRoot);
      if (existingTabs.length > 0) {
        // Return the most recently active tab
        const sorted = [...existingTabs].sort(
          (a, b) =>
            new Date(b.lastActivityAt).getTime() -
            new Date(a.lastActivityAt).getTime()
        );
        return sorted[0];
      }

      // Create new tab
      return createTab(repoRoot);
    },
    [getTabsForRepo, createTab]
  );

  const deleteTab = useCallback(async (tabId: string): Promise<void> => {
    await api.deleteTab(tabId);

    setState((prev) => {
      const tab = prev.tabs.get(tabId);
      if (!tab) return prev;

      const tabs = new Map(prev.tabs);
      tabs.delete(tabId);

      const tabsByRepo = new Map(prev.tabsByRepo);
      const existing = tabsByRepo.get(tab.repoRoot) ?? [];
      tabsByRepo.set(
        tab.repoRoot,
        existing.filter((id) => id !== tabId)
      );

      return { ...prev, tabs, tabsByRepo };
    });
  }, []);

  /**
   * Update tab state when a segment is rotated.
   * Called by WebSocket event handler when daemon notifies of segment change.
   */
  const handleSegmentRotated = useCallback(
    (tabId: string, segment: ClaudeSegment) => {
      setState((prev) => {
        const tab = prev.tabs.get(tabId);
        if (!tab) return prev;

        // Close previous segment if exists
        const updatedSegments = [...tab.segments];
        if (tab.activeSegmentIndex >= 0) {
          updatedSegments[tab.activeSegmentIndex] = {
            ...updatedSegments[tab.activeSegmentIndex],
            endedAt: new Date().toISOString(),
          };
        }

        // Append new segment
        updatedSegments.push(segment);

        const updatedTab: TerminalTab = {
          ...tab,
          segments: updatedSegments,
          activeSegmentIndex: updatedSegments.length - 1,
          lastActivityAt: new Date().toISOString(),
        };

        const tabs = new Map(prev.tabs);
        tabs.set(tabId, updatedTab);

        return { ...prev, tabs };
      });
    },
    []
  );

  return {
    tabs: Array.from(state.tabs.values()),
    isLoading: state.isLoading,
    error: state.error,
    createTab,
    createOrGetTab,
    getTab,
    getTabsForRepo,
    deleteTab,
    handleSegmentRotated,
    refresh: loadTabs,
  };
}

/**
 * Hook for a specific tab's state.
 * Provides reactive updates when the tab changes.
 */
export function useTab(tabId: string | null) {
  const { getTab, handleSegmentRotated, refresh } = useTabManager();
  const [tab, setTab] = useState<TerminalTab | undefined>(undefined);

  // Update tab when tabId changes or tabs are refreshed
  useEffect(() => {
    if (tabId) {
      const currentTab = getTab(tabId);
      setTab(currentTab);
    } else {
      setTab(undefined);
    }
  }, [tabId, getTab]);

  // Get active segment info
  const activeSegment =
    tab && tab.activeSegmentIndex >= 0
      ? tab.segments[tab.activeSegmentIndex]
      : undefined;

  return {
    tab,
    activeSegment,
    segments: tab?.segments ?? [],
    segmentCount: tab?.segments.length ?? 0,
    handleSegmentRotated,
    refresh,
  };
}
