/**
 * RosterItem - Mission Card for operator cockpit
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────┐
 * │ ● Mission Title                          main ↻2   │
 * │   Now: Working → Edit: src/api.ts                  │
 * │   Last: "Updating handler..."      Updated: 30s   │
 * └─────────────────────────────────────────────────────┘
 */

import { GitBranch } from "lucide-react";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import { getMissionText, getNowText, getLastText, formatTimeAgo } from "./constants";
import type { RosterItemProps } from "./types";

export function RosterItem({ session, isSelected, onSelect, compact }: RosterItemProps) {
  const { status, fileStatusValue } = getEffectiveStatus(session);

  // Status indicator classes
  const getStatusClass = () => {
    if (fileStatusValue === "error") return "mission-card__status--error";
    switch (status) {
      case "working":
        return "mission-card__status--working";
      case "waiting":
        return "mission-card__status--waiting";
      default:
        return "mission-card__status--idle";
    }
  };

  // Status icon
  const getStatusIcon = () => {
    if (fileStatusValue === "error") return "✖";
    switch (status) {
      case "working":
        return "●";
      case "waiting":
        return "!";
      default:
        return "○";
    }
  };

  const mission = getMissionText(session);
  const nowText = getNowText(session);
  const lastText = getLastText(session);
  const updatedText = formatTimeAgo(session.lastActivityAt);

  // Only show branch chip if title is different from branch name
  const showBranchChip = session.gitBranch && mission !== session.gitBranch;

  return (
    <div
      className={`mission-card ${isSelected ? "mission-card--selected" : ""} ${getStatusClass()}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Line 1: Status + Mission + Time */}
      <div className="mission-card__header">
        <span className={`mission-card__status-icon ${getStatusClass()}`}>
          {getStatusIcon()}
        </span>
        <span className="mission-card__title" title={mission}>
          {mission}
        </span>
        <span className="mission-card__updated">
          {updatedText}
        </span>
      </div>

      {/* Line 2: Brief status (only if not compact and has meaningful info) */}
      {!compact && nowText && nowText !== "Idle" && (
        <div className="mission-card__now">
          {nowText}
        </div>
      )}
    </div>
  );
}
