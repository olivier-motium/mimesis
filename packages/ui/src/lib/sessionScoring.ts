/**
 * Session scoring utilities for repo grouping and activity ranking.
 * Shared between live data (useSessions) and mock data.
 */

type SessionStatus = "working" | "waiting" | "idle";

/** Minimal session interface needed for scoring */
export interface ScoringSession {
  status: SessionStatus;
  lastActivityAt: string;
  hasPendingToolUse: boolean;
  gitRepoId: string | null;
}

export interface RepoGroup<T extends ScoringSession> {
  repoId: string;
  repoUrl: string | null;
  sessions: T[];
  activityScore: number;
}

const STATUS_WEIGHTS: Record<SessionStatus, number> = {
  working: 100,
  waiting: 50,
  idle: 1,
};

const PENDING_TOOL_BONUS = 30;

/**
 * Calculate activity score for a repo group.
 * Score = sum of (status weight + pending bonus) * decay factor per session.
 * Decay factor halves every 30 minutes of inactivity.
 */
export function calculateRepoActivityScore<T extends ScoringSession>(sessions: T[]): number {
  const now = Date.now();

  return sessions.reduce((score, session) => {
    const ageMs = now - new Date(session.lastActivityAt).getTime();
    const ageMinutes = ageMs / (1000 * 60);

    let sessionScore = STATUS_WEIGHTS[session.status];
    if (session.hasPendingToolUse) {
      sessionScore += PENDING_TOOL_BONUS;
    }

    const decayFactor = Math.pow(0.5, ageMinutes / 30);
    return score + sessionScore * decayFactor;
  }, 0);
}

/**
 * Group sessions by repo, sorted by activity score (highest first).
 * Sessions without a gitRepoId are grouped under "Other" at the end.
 */
export function groupSessionsByRepo<T extends ScoringSession>(sessions: T[]): RepoGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const session of sessions) {
    const key = session.gitRepoId ?? "Other";
    const existing = groups.get(key) ?? [];
    existing.push(session);
    groups.set(key, existing);
  }

  const groupsWithScores = Array.from(groups.entries()).map(([key, sessions]) => ({
    repoId: key,
    repoUrl: key === "Other" ? null : `https://github.com/${key}`,
    sessions,
    activityScore: calculateRepoActivityScore(sessions),
  }));

  groupsWithScores.sort((a, b) => {
    if (a.repoId === "Other") return 1;
    if (b.repoId === "Other") return -1;
    return b.activityScore - a.activityScore;
  });

  return groupsWithScores;
}
