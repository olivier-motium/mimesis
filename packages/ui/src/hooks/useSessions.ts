import { useMemo } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { getSessionsDbSync } from "../data/sessionsDb";
import type { Session } from "../types/schema";

/**
 * Hook to get all sessions from the StreamDB.
 * Returns reactive data that updates when sessions change.
 *
 * NOTE: This must only be called after the root loader has run,
 * which initializes the db via getSessionsDb().
 */
export function useSessions() {
  // Get db instance - may throw if not initialized
  let db;
  try {
    db = getSessionsDbSync();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "StreamDB not initialized";
    console.error("[useSessions] Failed to get db:", errorMsg);
    return {
      sessions: [] as Session[],
      isLoading: false,
      error: errorMsg,
    };
  }

  const query = useLiveQuery(
    (q) => q.from({ sessions: db.collections.sessions }),
    [db]
  );

  // Handle query errors
  if (query?.error) {
    console.error("[useSessions] Query error:", query.error);
    return {
      sessions: [] as Session[],
      isLoading: false,
      error: query.error.message ?? "Query failed",
    };
  }

  // Memoize expensive transformations - only recompute when data changes
  const sessions = useMemo(() => {
    if (!query?.data) return [];

    // Transform Map to array
    const allSessions = Array.from(query.data.values()) as Session[];

    // Filter to only sessions with status files (hook system installed)
    const sessionsWithStatus = allSessions.filter((s) => s.fileStatus !== null);

    // Deduplicate: keep only the most recent session per project (cwd)
    // Multiple Claude Code sessions can exist for the same project directory
    // (e.g., from compact feature creating new session files), but they all
    // share the same .claude/status.md file. Show only the most recent.
    const sessionsByCwd = new Map<string, Session>();
    for (const session of sessionsWithStatus) {
      const existing = sessionsByCwd.get(session.cwd);
      if (!existing || session.lastActivityAt > existing.lastActivityAt) {
        sessionsByCwd.set(session.cwd, session);
      }
    }

    return Array.from(sessionsByCwd.values());
  }, [query?.data]);

  return {
    sessions,
    isLoading: query?.isLoading ?? false,
    error: null,
  };
}
