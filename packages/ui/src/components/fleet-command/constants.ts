/**
 * Constants for Fleet Command UI
 */

/** Status labels for display */
export const STATUS_LABELS = {
  working: "Working",
  waiting: "Needs Input",
  idle: "Idle",
} as const;

/** Format relative time (e.g., "2m", "1h", "3d") */
export function formatTimeAgo(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

/** Format time for ticker (HH:MM:SS) */
export function formatTickerTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Get agent name from session */
export function getAgentName(session: { gitBranch: string | null; sessionId: string }): string {
  if (session.gitBranch) {
    // Truncate long branch names
    return session.gitBranch.length > 20
      ? session.gitBranch.slice(0, 17) + "..."
      : session.gitBranch;
  }
  // Use last 8 chars of session ID
  return `session-${session.sessionId.slice(-8)}`;
}

/** Get goal text with fallback */
export function getGoalText(session: { goal: string; originalPrompt: string }): string {
  return session.goal || session.originalPrompt || "No goal set";
}

/** Extract file paths from session data */
export function extractArtifacts(session: {
  pendingTool?: { tool: string; target: string } | null;
  recentOutput?: Array<{ content: string }>;
}): string[] {
  const artifacts: Set<string> = new Set();

  // Add pending tool target if it looks like a file path
  if (session.pendingTool?.target) {
    const target = session.pendingTool.target;
    if (target.includes("/") || target.includes(".")) {
      artifacts.add(target);
    }
  }

  // Extract file paths from recent output (simple heuristic)
  if (session.recentOutput) {
    for (const output of session.recentOutput) {
      // Match common file path patterns
      const matches = output.content.match(/(?:src|packages|lib|tests?)\/[\w\-./]+\.\w+/g);
      if (matches) {
        matches.forEach(m => artifacts.add(m));
      }
    }
  }

  return Array.from(artifacts).slice(0, 10); // Limit to 10 artifacts
}

/** Parse plan steps from file status or synthesize from goal */
export function parsePlanSteps(session: {
  fileStatus?: { nextSteps?: string } | null;
  goal: string;
  summary: string;
}): Array<{ done: boolean; text: string }> {
  // Try to parse from fileStatus.nextSteps
  if (session.fileStatus?.nextSteps) {
    const steps = session.fileStatus.nextSteps
      .split(/[\n•\-\d.]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return steps.map(text => ({ done: false, text }));
  }

  // Fallback: synthesize from goal and summary
  const steps: Array<{ done: boolean; text: string }> = [];

  if (session.goal) {
    steps.push({ done: false, text: session.goal });
  }

  if (session.summary && session.summary !== session.goal) {
    steps.push({ done: true, text: session.summary });
  }

  return steps;
}
