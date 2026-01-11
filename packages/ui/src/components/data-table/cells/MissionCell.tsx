/**
 * MissionCell - Consolidated table cell showing Mission + Now + Last + Updated
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────────┐
 * │ Mission Title                               main · mimesis   │
 * │ Now: Working → Edit: src/api.ts                              │
 * │ Last: "Updating handler..."                  Updated: 30s    │
 * └──────────────────────────────────────────────────────────────┘
 */

import { GitBranch } from "lucide-react";
import type { Session } from "@/types/schema";
import { getMissionText, getNowText, getLastText, formatTimeAgo } from "../../fleet-command/constants";
import { getEffectiveStatus } from "@/lib/sessionStatus";

interface MissionCellProps {
  session: Session;
}

export function MissionCell({ session }: MissionCellProps) {
  const { status, fileStatusValue } = getEffectiveStatus(session);

  const mission = getMissionText(session);
  const nowText = getNowText(session);
  const lastText = getLastText(session);
  const updatedText = formatTimeAgo(session.lastActivityAt);

  // Status color for "Now" line
  const getStatusColor = () => {
    if (fileStatusValue === "error") return "var(--nb-red)";
    switch (status) {
      case "working":
        return "var(--nb-green)";
      case "waiting":
        return "var(--nb-yellow)";
      default:
        return "var(--nb-text-dim)";
    }
  };

  return (
    <div className="mission-cell">
      {/* Line 1: Mission + Chips */}
      <div className="mission-cell__header">
        <span className="mission-cell__title" title={mission}>
          {mission}
        </span>
        <div className="mission-cell__chips">
          {session.gitBranch && (
            <span className="mission-cell__chip" title={session.gitBranch}>
              <GitBranch size={10} />
              {session.gitBranch.length > 10
                ? session.gitBranch.slice(0, 7) + "..."
                : session.gitBranch}
            </span>
          )}
          {session.gitRepoId && (
            <span className="mission-cell__chip mission-cell__chip--repo">
              {session.gitRepoId.split("/").pop()}
            </span>
          )}
        </div>
      </div>

      {/* Line 2: Now */}
      <div className="mission-cell__now" style={{ color: getStatusColor() }}>
        Now: {nowText}
      </div>

      {/* Line 3: Last + Updated */}
      <div className="mission-cell__footer">
        {lastText && (
          <span className="mission-cell__last" title={lastText}>
            Last: {lastText}
          </span>
        )}
        <span className="mission-cell__updated">
          Updated: {updatedText}
        </span>
      </div>
    </div>
  );
}
