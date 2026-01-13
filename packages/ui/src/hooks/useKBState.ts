/**
 * Hook for managing KB (Knowledge Base) state.
 *
 * Provides:
 * - Project list with sync status
 * - Statistics
 * - Sync triggers (which return instructions for Commander)
 */

import { useState, useEffect, useCallback } from "react";
import {
  getKBProjects,
  getKBStats,
  triggerKBSync,
  triggerProjectKBSync,
  type KBProject,
  type KBStats,
} from "../lib/kb-api";

export interface KBState {
  /** Whether the KB is initialized */
  initialized: boolean;
  /** Whether data is loading */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** List of KB projects */
  projects: KBProject[];
  /** KB statistics */
  stats: KBStats | null;
  /** Message from KB system (e.g., "not initialized") */
  message: string | null;
}

export interface KBActions {
  /** Refresh KB data */
  refresh: () => Promise<void>;
  /** Trigger sync for all projects */
  syncAll: (full?: boolean) => Promise<{ message: string; hint: string }>;
  /** Trigger sync for a specific project */
  syncProject: (projectId: string, full?: boolean) => Promise<{ message: string; hint: string }>;
}

/**
 * Hook for managing KB state.
 *
 * @param autoRefresh - Whether to auto-refresh on mount (default: true)
 * @param refreshInterval - Interval for auto-refresh in ms (0 = disabled)
 */
export function useKBState(
  autoRefresh: boolean = true,
  refreshInterval: number = 0
): [KBState, KBActions] {
  const [state, setState] = useState<KBState>({
    initialized: false,
    loading: true,
    error: null,
    projects: [],
    stats: null,
    message: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const [projectsResponse, statsResponse] = await Promise.all([
        getKBProjects(),
        getKBStats(),
      ]);

      setState({
        initialized: projectsResponse.initialized,
        loading: false,
        error: null,
        projects: projectsResponse.projects,
        stats: statsResponse,
        message: projectsResponse.message ?? null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load KB data",
      }));
    }
  }, []);

  const syncAll = useCallback(async (full: boolean = false) => {
    return triggerKBSync(full);
  }, []);

  const syncProject = useCallback(async (projectId: string, full: boolean = false) => {
    return triggerProjectKBSync(projectId, full);
  }, []);

  // Initial load
  useEffect(() => {
    if (autoRefresh) {
      refresh();
    }
  }, [autoRefresh, refresh]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, refresh]);

  return [
    state,
    {
      refresh,
      syncAll,
      syncProject,
    },
  ];
}
