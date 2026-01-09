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
  // Aggregate by work chain: show one session per work chain (the latest non-superseded one)
  const sessions = useMemo(() => {
    if (!query?.data) return [];

    // Transform Map to array
    const allSessions = Array.from(query.data.values()) as Session[];

    // Group sessions by work chain ID
    // Each work chain gets one representative session (the active/latest one)
    const workChains = new Map<string, Session>();

    for (const session of allSessions) {
      // Use workChainId if available, otherwise sessionId (for sessions that haven't been compacted)
      const chainId = session.workChainId ?? session.sessionId;
      const existing = workChains.get(chainId);

      // Keep the non-superseded session, or if both superseded, keep the most recent
      if (!existing) {
        workChains.set(chainId, session);
      } else if (!session.superseded && existing.superseded) {
        // Prefer non-superseded session
        workChains.set(chainId, session);
      } else if (!existing.superseded && session.superseded) {
        // Keep the non-superseded existing session
        // (do nothing)
      } else {
        // Both same superseded status - keep the most recently active one
        const existingTime = new Date(existing.lastActivityAt).getTime();
        const sessionTime = new Date(session.lastActivityAt).getTime();
        if (sessionTime > existingTime) {
          workChains.set(chainId, session);
        }
      }
    }

    // Return the representative session for each work chain
    return Array.from(workChains.values());
  }, [query?.data]);

  return {
    sessions,
    isLoading: query?.isLoading ?? false,
    error: null,
  };
}
