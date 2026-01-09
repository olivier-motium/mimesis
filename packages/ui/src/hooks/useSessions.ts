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

  // Transform to array of sessions
  // The query.data is a Map where values are the session objects directly
  const allSessions: Session[] = query?.data
    ? Array.from(query.data.values())
    : [];

  // Filter to only sessions with status files (hook system installed)
  // This hides old sessions from before the hook system was added
  const sessionsWithStatus = allSessions.filter((session) => session.fileStatus !== null);

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

  const sessions = Array.from(sessionsByCwd.values());

  return {
    sessions,
    isLoading: query?.isLoading ?? false,
    error: null,
  };
}
