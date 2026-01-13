/**
 * CommandBar - Top header for Fleet Command
 *
 * Shows: Logo, view indicator, agent counts, Commander toggle
 */

import { Cpu, Brain, Loader2, LayoutDashboard, Terminal } from "lucide-react";
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
  return (
    <header className="fleet-command-bar">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Logo - Minimal */}
        <div className="fleet-command-bar__logo">
          <Cpu size={16} />
          <span>MIMESIS</span>
        </div>

        {/* View indicator */}
        <div className="fleet-command-bar__divider" />
        <div className="fleet-command-bar__status">
          {showCommander ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--nb-yellow)" }}>
              <Brain size={12} />
              Commander
            </span>
          ) : selectedSession ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--nb-text)" }}>
              <Terminal size={12} />
              {selectedSession.workChainName || selectedSession.gitBranch || "Agent"}
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--nb-text-dim)" }}>
              <LayoutDashboard size={12} />
              Fleet Overview
            </span>
          )}
        </div>

        {/* Agent count */}
        <div className="fleet-command-bar__divider" />
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
        {/* Commander toggle with label */}
        {onToggleCommander && (
          <button
            className={`fleet-command-bar__commander-btn ${showCommander ? "fleet-command-bar__commander-btn--active" : ""}`}
            onClick={onToggleCommander}
            title="Toggle Commander (Ctrl+Tab)"
            style={{ width: "auto", paddingLeft: 10, paddingRight: 10, gap: 6 }}
          >
            <Brain size={14} />
            <span style={{ fontSize: 11, fontWeight: 500 }}>Commander</span>
          </button>
        )}
      </div>
    </header>
  );
}
