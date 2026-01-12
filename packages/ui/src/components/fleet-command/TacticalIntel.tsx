/**
 * TacticalIntel - Right sidebar Inspector Panel (Zone C)
 *
 * New operator-focused layout:
 * ┌─────────────────────────┐
 * │ SESSION HUD             │
 * │ Mission + Status        │
 * ├─────────────────────────┤
 * │ ASK / DECIDE            │
 * │ (only when waiting)     │
 * ├─────────────────────────┤
 * │ LIVE STATE              │
 * │ Tool + CWD + Last Event │
 * ├─────────────────────────┤
 * │ RECENT OUTPUT           │
 * │ (scrollable)            │
 * └─────────────────────────┘
 */

import { GitBranch, AlertTriangle, CheckCircle2, Clock, Terminal, FolderOpen, MessageSquare, Wifi, WifiOff, Loader2, Bell } from "lucide-react";
import { getMissionText, getNowText, formatTimeAgo } from "./constants";
import { getEffectiveStatus } from "@/lib/sessionStatus";
import type { TacticalIntelProps } from "./types";

export function TacticalIntel({ session, fleetEvents = [], gatewayStatus = "disconnected" }: TacticalIntelProps) {
  // Empty state
  if (!session) {
    return (
      <aside className="fleet-intel">
        <div className="intel-empty">
          <div className="intel-empty__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </div>
          <div className="intel-empty__title">Tactical Intel</div>
          <div className="intel-empty__subtitle">Select an agent to view status and details</div>
        </div>
      </aside>
    );
  }

  const { status, fileStatusValue } = getEffectiveStatus(session);
  const mission = getMissionText(session);
  const nowText = getNowText(session);
  const isWaitingForAction = status === "waiting" && session.hasPendingToolUse;

  // Status badge styling
  const getStatusBadge = () => {
    if (fileStatusValue === "error") {
      return { label: "Error", className: "inspector-hud__status--error" };
    }
    switch (status) {
      case "working":
        return { label: "Working", className: "inspector-hud__status--working" };
      case "waiting":
        return { label: "Waiting", className: "inspector-hud__status--waiting" };
      default:
        return { label: "Idle", className: "inspector-hud__status--idle" };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <aside className="fleet-intel">
      {/* Session HUD */}
      <div className="inspector-hud">
        <div className="inspector-hud__header">
          <span className={`inspector-hud__status ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
          <span className="inspector-hud__time">
            {formatTimeAgo(session.lastActivityAt)}
          </span>
        </div>
        <div className="inspector-hud__mission" title={mission}>
          {mission}
        </div>
        <div className="inspector-hud__context">
          {session.gitBranch && (
            <span className="inspector-hud__chip">
              <GitBranch size={10} />
              {session.gitBranch}
            </span>
          )}
          {session.gitRepoId && (
            <span className="inspector-hud__chip">
              {session.gitRepoId.split("/").pop()}
            </span>
          )}
          {session.compactionCount > 0 && (
            <span className="inspector-hud__chip inspector-hud__chip--compaction">
              ↻{session.compactionCount}
            </span>
          )}
        </div>
      </div>

      {/* Ask/Decide Section - Only when waiting for approval */}
      {isWaitingForAction && session.pendingTool && (
        <div className="inspector-ask">
          <div className="inspector-ask__header">
            <AlertTriangle size={14} className="inspector-ask__icon" />
            Requires Action
          </div>
          <div className="inspector-ask__content">
            <div className="inspector-ask__tool">
              <span className="inspector-ask__tool-label">Tool:</span>
              <span className="inspector-ask__tool-name">{session.pendingTool.tool}</span>
            </div>
            {session.pendingTool.target && (
              <div className="inspector-ask__target" title={session.pendingTool.target}>
                {session.pendingTool.target.length > 50
                  ? session.pendingTool.target.slice(0, 47) + "..."
                  : session.pendingTool.target}
              </div>
            )}
          </div>
          <div className="inspector-ask__hint">
            Attach terminal to approve or deny
          </div>
        </div>
      )}

      {/* Live State Section */}
      <div className="inspector-state">
        <div className="inspector-state__header">
          <Terminal size={12} />
          Live State
        </div>
        <div className="inspector-state__content">
          <div className="inspector-state__row">
            <span className="inspector-state__label">Now:</span>
            <span className="inspector-state__value">{nowText}</span>
          </div>
          <div className="inspector-state__row">
            <span className="inspector-state__label">
              <FolderOpen size={10} />
            </span>
            <span className="inspector-state__value inspector-state__value--mono" title={session.cwd}>
              {session.cwd.length > 30 ? "..." + session.cwd.slice(-27) : session.cwd}
            </span>
          </div>
          <div className="inspector-state__row">
            <span className="inspector-state__label">
              <Clock size={10} />
            </span>
            <span className="inspector-state__value">
              Last activity {formatTimeAgo(session.lastActivityAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Output Section */}
      <div className="inspector-output">
        <div className="inspector-output__header">
          <MessageSquare size={12} />
          Recent Output
        </div>
        <div className="inspector-output__content">
          {session.recentOutput.length === 0 ? (
            <div className="inspector-output__empty">No recent output</div>
          ) : (
            session.recentOutput.slice(-5).map((output, i) => (
              <div key={i} className={`inspector-output__entry inspector-output__entry--${output.role}`}>
                <span className="inspector-output__role">
                  {output.role === "assistant" ? "AI" : output.role === "user" ? "You" : "Tool"}
                </span>
                <span className="inspector-output__text" title={output.content}>
                  {output.content.length > 100
                    ? output.content.slice(0, 97) + "..."
                    : output.content}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* File Status (if available) */}
      {session.fileStatus && (
        <div className="inspector-file-status">
          <div className="inspector-file-status__header">
            <CheckCircle2 size={12} />
            Status File
          </div>
          <div className="inspector-file-status__content">
            {session.fileStatus.task && (
              <div className="inspector-file-status__task">
                {session.fileStatus.task}
              </div>
            )}
            {session.fileStatus.summary && (
              <div className="inspector-file-status__summary">
                {session.fileStatus.summary}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fleet Events (recent) */}
      {fleetEvents.length > 0 && (
        <div className="inspector-fleet-events">
          <div className="inspector-fleet-events__header">
            <Bell size={12} />
            Fleet Events
          </div>
          <div className="inspector-fleet-events__content">
            {fleetEvents.slice(-5).reverse().map((event) => (
              <div key={event.eventId} className="inspector-fleet-events__entry">
                <span className="inspector-fleet-events__type">{event.type}</span>
                {event.projectId && (
                  <span className="inspector-fleet-events__project">
                    {event.projectId.split("__")[0]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gateway Status */}
      <div className="inspector-gateway">
        <div className="inspector-gateway__header">
          {gatewayStatus === "connected" && <Wifi size={12} />}
          {gatewayStatus === "connecting" && <Loader2 size={12} className="animate-spin" />}
          {gatewayStatus === "disconnected" && <WifiOff size={12} />}
          Gateway
        </div>
        <div className={`inspector-gateway__status inspector-gateway__status--${gatewayStatus}`}>
          {gatewayStatus === "connected" ? "Connected" : gatewayStatus === "connecting" ? "Connecting..." : "Disconnected"}
        </div>
      </div>
    </aside>
  );
}
