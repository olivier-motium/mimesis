/**
 * LiveStatePanel - Right Sidebar
 *
 * Shows live state for the selected agent:
 * - Status badge
 * - Current action (Now)
 * - Working directory (CWD)
 * - Recent output
 */

import { Clock, FolderOpen, MessageSquare } from "lucide-react";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import { formatTimeAgo, getNowText } from "../fleet-command/constants";
import type { LiveStatePanelProps } from "./types";

export function LiveStatePanel({ session }: LiveStatePanelProps) {
  // Empty state
  if (!session) {
    return (
      <aside className="live-state-panel">
        <div className="live-state-panel__empty">
          Select an agent to view live state
        </div>
      </aside>
    );
  }

  const { status, fileStatusValue } = getEffectiveStatus(session);
  const nowText = getNowText(session);

  // Status badge styling
  const getStatusBadge = () => {
    if (fileStatusValue === "error") {
      return { label: "Error", className: "live-state-panel__status--error" };
    }
    switch (status) {
      case "working":
        return { label: "Working", className: "live-state-panel__status--working" };
      case "waiting":
        return { label: "Waiting", className: "live-state-panel__status--waiting" };
      default:
        return { label: "Idle", className: "live-state-panel__status--idle" };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <aside className="live-state-panel">
      {/* Status Section */}
      <div className="live-state-panel__section">
        <div className="live-state-panel__section-header">STATUS</div>
        <div className={`live-state-panel__status ${statusBadge.className}`}>
          <span className="live-state-panel__status-dot">●</span>
          {statusBadge.label}
        </div>
      </div>

      {/* Now Section */}
      <div className="live-state-panel__section">
        <div className="live-state-panel__section-header">NOW</div>
        <div className="live-state-panel__value">{nowText}</div>
      </div>

      {/* CWD Section */}
      <div className="live-state-panel__section">
        <div className="live-state-panel__section-header">
          <FolderOpen size={12} />
          CWD
        </div>
        <div className="live-state-panel__value live-state-panel__value--mono" title={session.cwd}>
          {session.cwd.length > 35 ? "..." + session.cwd.slice(-32) : session.cwd}
        </div>
      </div>

      {/* Last Activity Section */}
      <div className="live-state-panel__section">
        <div className="live-state-panel__section-header">
          <Clock size={12} />
          LAST ACTIVITY
        </div>
        <div className="live-state-panel__value">
          {formatTimeAgo(session.lastActivityAt)}
        </div>
      </div>

      {/* Recent Output Section */}
      <div className="live-state-panel__section live-state-panel__section--output">
        <div className="live-state-panel__section-header">
          <MessageSquare size={12} />
          RECENT OUTPUT
        </div>
        <div className="live-state-panel__output">
          {session.recentOutput.length === 0 ? (
            <div className="live-state-panel__output-empty">No recent output</div>
          ) : (
            session.recentOutput.slice(-10).map((output, i) => (
              <div
                key={i}
                className={`live-state-panel__output-entry live-state-panel__output-entry--${output.role}`}
              >
                <span className="live-state-panel__output-role">
                  {output.role === "assistant" ? "AI" : output.role === "user" ? "You" : "Tool"}
                </span>
                <span className="live-state-panel__output-text" title={output.content}>
                  {output.content.length > 80
                    ? output.content.slice(0, 77) + "..."
                    : output.content}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
