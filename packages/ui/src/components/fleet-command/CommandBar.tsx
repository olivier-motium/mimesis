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
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* Logo */}
        <div className="fleet-command-bar__logo">
          <Cpu size={18} />
          <span>MIMESIS</span>
        </div>

        <div className="fleet-command-bar__divider" />

        {/* Session info (when selected) */}
        {selectedSession && (
          <>
            <div className="fleet-command-bar__session-info">
              <span className="fleet-command-bar__session-name">
                {selectedSession.gitBranch || selectedSession.sessionId.slice(-8)}
              </span>
              {selectedSession.gitBranch && (
                <span className="fleet-command-bar__branch">
                  <GitBranch size={12} />
                  {selectedSession.gitBranch}
                </span>
              )}
              <span className={`fleet-command-bar__status-badge fleet-command-bar__status-badge--${sessionStatus?.status}`}>
                {statusLabel}
              </span>
            </div>
            <div className="fleet-command-bar__divider" />
          </>
        )}

        {/* Gateway + Agent status */}
        <div className="fleet-command-bar__status">
          <span className={`fleet-command-bar__gateway fleet-command-bar__gateway--${gatewayStatus}`}>
            {gatewayStatus === "connected" && <Wifi size={12} />}
            {gatewayStatus === "connecting" && <Loader2 size={12} className="animate-spin" />}
            {gatewayStatus === "disconnected" && <WifiOff size={12} />}
            {gatewayStatus === "connected" ? "ONLINE" : gatewayStatus === "connecting" ? "CONNECTING" : "OFFLINE"}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Layers size={12} />
            AGENTS: {workingCount}/{sessionCount} Active
          </span>
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
            Commander
          </button>
        )}
        <div className="fleet-command-bar__version">v5.0.0</div>
      </div>
    </header>
  );
}
