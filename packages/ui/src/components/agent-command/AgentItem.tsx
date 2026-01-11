/**
 * AgentItem - Individual agent entry in the sidebar
 *
 * Acts as a "tab" - clicking it selects this agent for the terminal view.
 * Shows status indicator, agent name, and branch.
 */

import { GitBranch } from "lucide-react";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import type { AgentItemProps } from "./types";

export function AgentItem({ session, isSelected, onSelect }: AgentItemProps) {
  const { status, fileStatusValue } = getEffectiveStatus(session);

  // Get agent name (branch or session ID)
  const agentName = session.gitBranch || `session-${session.sessionId.slice(-8)}`;

  // Status indicator
  const getStatusIndicator = () => {
    if (fileStatusValue === "error") {
      return { symbol: "✖", className: "agent-item__status--error" };
    }
    switch (status) {
      case "working":
        return { symbol: "●", className: "agent-item__status--working" };
      case "waiting":
        return { symbol: "!", className: "agent-item__status--waiting" };
      default:
        return { symbol: "○", className: "agent-item__status--idle" };
    }
  };

  const statusIndicator = getStatusIndicator();

  return (
    <button
      className={`agent-item ${isSelected ? "agent-item--selected" : ""}`}
      onClick={onSelect}
      aria-selected={isSelected}
    >
      <span className={`agent-item__status ${statusIndicator.className}`}>
        {statusIndicator.symbol}
      </span>
      <span className="agent-item__name" title={agentName}>
        {agentName.length > 20 ? agentName.slice(0, 17) + "..." : agentName}
      </span>
      {session.gitBranch && (
        <span className="agent-item__branch">
          <GitBranch size={10} />
        </span>
      )}
    </button>
  );
}
