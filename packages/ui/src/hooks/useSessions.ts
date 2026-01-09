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
    // Each session now has its own status file (status.<sessionId>.md),
    // so multiple sessions in the same project are handled correctly
    return allSessions.filter((s) => s.fileStatus !== null);
  }, [query?.data]);

  return {
    sessions,
    isLoading: query?.isLoading ?? false,
    error: null,
  };
}
