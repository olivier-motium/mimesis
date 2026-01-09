/**
 * CommandBar - Top header for Fleet Command
 *
 * Displays logo, agent counts, and status indicators
 */

import { Cpu, Layers } from "lucide-react";
import type { CommandBarProps } from "./types";

export function CommandBar({ sessionCount, workingCount }: CommandBarProps) {
  return (
    <header className="fleet-command-bar">
      <div style={{ display: "flex", alignItems: "center" }}>
        <div className="fleet-command-bar__logo">
          <Cpu size={18} />
          <span>NANO // BANANA // PRO</span>
        </div>

        <div className="fleet-command-bar__divider" />

        <div className="fleet-command-bar__status">
          <span className="fleet-command-bar__online">
            <div className="fleet-command-bar__online-dot" />
            ONLINE
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Layers size={12} />
            AGENTS: {workingCount}/{sessionCount} Active
          </span>
        </div>
      </div>

      <div className="fleet-command-bar__meta">
        <div className="fleet-command-bar__version">v2.0.0</div>
      </div>
    </header>
  );
}
