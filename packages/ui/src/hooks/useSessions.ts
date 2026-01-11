import { useMemo } from "react";
import { useGateway, type TrackedSession } from "./useGateway";
import type { Session } from "../types/schema";

/**
 * Convert TrackedSession (from gateway) to Session format (for UI components).
 * Provides default values for fields not available in TrackedSession.
 */
function trackedToSession(tracked: TrackedSession): Session {
  // Extract goal/summary from fileStatus if available
  const goal = tracked.fileStatus?.task ?? tracked.originalPrompt ?? "";
  const summary = tracked.fileStatus?.summary ?? "";

  return {
    sessionId: tracked.sessionId,
    cwd: tracked.cwd,
    gitBranch: tracked.gitBranch ?? null,
    gitRepoUrl: tracked.gitRepoUrl ?? null,
    gitRepoId: tracked.gitRepoUrl
      ? tracked.gitRepoUrl.split("/").slice(-2).join("/").replace(".git", "")
      : null,
    originalPrompt: tracked.originalPrompt ?? "",
    status: tracked.status,
    createdAt: tracked.createdAt,
    lastActivityAt: tracked.lastActivityAt,
    messageCount: 0,
    hasPendingToolUse: tracked.fileStatus?.status === "waiting_for_approval",
    pendingTool: null,
    goal,
    summary,
    recentOutput: [],
    terminalLink: null,
    embeddedPty: null,
    fileStatus: tracked.fileStatus ?? null,
    workChainId: null,
    workChainName: null,
    compactionCount: 0,
    superseded: false,
    supersededBy: null,
    supersededAt: null,
  };
}

/**
 * Hook to get all sessions.
 * Uses Gateway WebSocket for session data (v5.2).
 */
export function useSessions() {
  const { trackedSessions, status } = useGateway();

  // Convert TrackedSession map to Session array
  const sessions = useMemo(() => {
    const sessionArray: Session[] = [];
    for (const tracked of trackedSessions.values()) {
      sessionArray.push(trackedToSession(tracked));
    }

    // Sort by lastActivityAt descending (most recent first)
    sessionArray.sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return sessionArray;
  }, [trackedSessions]);

  return {
    sessions,
    isLoading: status === "connecting",
    error: status === "disconnected" ? "Gateway disconnected" : null,
  };
}
