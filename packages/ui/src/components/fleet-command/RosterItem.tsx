/**
 * RosterItem - Individual agent row in the Roster
 *
 * Shows status, branch, and activity time
 */

import { Activity, GitBranch } from "lucide-react";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import { getAgentName, formatTimeAgo } from "./constants";
import type { RosterItemProps } from "./types";

export function RosterItem({ session, isSelected, onSelect }: RosterItemProps) {
  const { status, fileStatusValue } = getEffectiveStatus(session);

  // Determine status class
  const getStatusClass = () => {
    if (fileStatusValue === "error") return "fleet-roster-item__status--error";
    switch (status) {
      case "working":
        return "fleet-roster-item__status--working";
      case "waiting":
        return "fleet-roster-item__status--waiting";
      default:
        return "fleet-roster-item__status--idle";
    }
  };

  return (
    <div
      className={`fleet-roster-item ${isSelected ? "fleet-roster-item--selected" : ""}`}
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
      <div className="fleet-roster-item__header">
        <span className="fleet-roster-item__name">
          {session.workChainName || getAgentName(session)}
          {session.compactionCount > 0 && (
            <span className="fleet-roster-item__compaction-badge" title={`Compacted ${session.compactionCount} time${session.compactionCount === 1 ? "" : "s"}`}>
              ↻{session.compactionCount}
            </span>
          )}
        </span>
        <Activity size={12} className={`fleet-roster-item__status ${getStatusClass()}`} />
      </div>

      <div className="fleet-roster-item__branch">
        <GitBranch size={10} className="fleet-roster-item__branch-icon" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {session.gitBranch || "no branch"}
        </span>
      </div>

      <div className="fleet-roster-item__activity">
        {formatTimeAgo(session.lastActivityAt)}
      </div>
    </div>
  );
}
