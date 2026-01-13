/**
 * CommandBar - Top header for Fleet Command
 *
 * Shows: Logo, session info (when selected), gateway status, agent counts
 */

import { Cpu, Brain, Loader2 } from "lucide-react";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import type { CommandBarProps } from "./types";

export function CommandBar({
  sessionCount,
  workingCount,
  selectedSession,
  gatewayStatus = "disconnected",
  onToggleCommander,
  showCommander = false,
}: CommandBarProps) {
  // Get status if session is selected
  const sessionStatus = selectedSession ? getEffectiveStatus(selectedSession) : null;
  const statusLabel = sessionStatus?.status === "working" ? "Working"
    : sessionStatus?.status === "waiting" ? "Waiting"
    : "Idle";

  return (
    <header className="fleet-command-bar">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Logo - Minimal */}
        <div className="fleet-command-bar__logo">
          <Cpu size={16} />
          <span>MIMESIS</span>
        </div>

        {/* Agent count - Minimal */}
        <div className="fleet-command-bar__status">
          <span style={{ color: workingCount > 0 ? "var(--nb-green)" : "var(--nb-text-dim)" }}>
            {workingCount} active
          </span>
          <span style={{ color: "var(--nb-text-muted)" }}>
            / {sessionCount}
          </span>
          {gatewayStatus === "connecting" && <Loader2 size={12} className="animate-spin" style={{ marginLeft: 8, color: "var(--nb-yellow)" }} />}
        </div>
      </div>

      <div className="fleet-command-bar__meta">
        {/* Commander toggle */}
        {onToggleCommander && (
          <button
            className={`fleet-command-bar__commander-btn ${showCommander ? "fleet-command-bar__commander-btn--active" : ""}`}
            onClick={onToggleCommander}
            title="Toggle Commander (Ctrl+Tab)"
          >
            <Brain size={14} />
          </button>
        )}
      </div>
    </header>
  );
}
