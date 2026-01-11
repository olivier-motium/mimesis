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

// ============================================
// Mission Card Helpers (Ops-first Bridge)
// ============================================

/** Get mission title (workChainName with fallback to originalPrompt) */
export function getMissionText(session: {
  workChainName?: string | null;
  originalPrompt?: string;
}): string {
  if (session.workChainName) {
    return session.workChainName;
  }
  if (session.originalPrompt) {
    // Truncate to 60 chars and clean up
    const cleaned = session.originalPrompt.replace(/\s+/g, " ").trim();
    return cleaned.length > 60 ? cleaned.slice(0, 57) + "..." : cleaned;
  }
  return "Untitled";
}

/** Get "Now" text showing current state and action */
export function getNowText(session: {
  status: "working" | "waiting" | "idle";
  hasPendingToolUse?: boolean;
  pendingTool?: { tool: string; target: string } | null;
}): string {
  const stateMap = {
    working: "Working",
    waiting: "Waiting",
    idle: "Idle",
  } as const;

  const state = stateMap[session.status];

  if (session.hasPendingToolUse && session.pendingTool) {
    const target = session.pendingTool.target;
    // Truncate long targets
    const shortTarget = target.length > 30 ? "..." + target.slice(-27) : target;
    return `${state} → ${session.pendingTool.tool}: ${shortTarget}`;
  }

  return state;
}

/** Get "Last" text from recent output */
export function getLastText(session: {
  recentOutput?: Array<{ role: string; content: string }>;
}): string {
  if (!session.recentOutput?.length) return "";

  // Find most recent assistant text
  const lastAssistant = session.recentOutput
    .filter(o => o.role === "assistant")
    .slice(-1)[0];

  if (lastAssistant?.content) {
    const cleaned = lastAssistant.content.replace(/\s+/g, " ").trim();
    if (cleaned.length > 40) {
      return `"${cleaned.slice(0, 37)}..."`;
    }
    return `"${cleaned}"`;
  }

  return "";
}
