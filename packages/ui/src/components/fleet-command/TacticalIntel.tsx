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

import { GitBranch, AlertTriangle, WifiOff, Loader2, Check, X, Brain, Users, Activity, Zap } from "lucide-react";
import { getMissionText, getNowText, formatTimeAgo } from "./constants";
import { getEffectiveStatus } from "@/lib/sessionStatus";
import type { TacticalIntelProps } from "./types";

export function TacticalIntel({ session, fleetEvents = [], gatewayStatus = "disconnected", onQuickAction, onReconnect, showCommander, commanderState, sessions = [] }: TacticalIntelProps) {
  // Commander mode - show fleet overview instead of session details
  if (showCommander) {
    // Calculate fleet stats
    const workingCount = sessions.filter(s => getEffectiveStatus(s).status === "working").length;
    const waitingCount = sessions.filter(s => {
      const { status } = getEffectiveStatus(s);
      return status === "waiting" && s.hasPendingToolUse;
    }).length;
    const idleCount = sessions.filter(s => getEffectiveStatus(s).status === "idle").length;

    return (
      <aside className="fleet-intel">
        {/* Fleet Overview Header */}
        <div className="inspector-hud">
          <div className="inspector-hud__header">
            <span className="inspector-hud__status inspector-hud__status--working">
              Fleet Intel
            </span>
          </div>
          <div className="inspector-hud__mission">
            Cross-project intelligence powered by Opus
          </div>
        </div>

        {/* Fleet Stats */}
        <div className="inspector-state">
          <div className="inspector-state__content">
            <div className="inspector-state__row">
              <span className="inspector-state__label">
                <Users size={12} className="mr-2" />
                Agents
              </span>
              <span className="inspector-state__value">{sessions.length}</span>
            </div>
            {workingCount > 0 && (
              <div className="inspector-state__row">
                <span className="inspector-state__label">
                  <Activity size={12} className="mr-2" />
                  Working
                </span>
                <span className="inspector-state__value inspector-state__value--working">{workingCount}</span>
              </div>
            )}
            {waitingCount > 0 && (
              <div className="inspector-state__row">
                <span className="inspector-state__label">
                  <AlertTriangle size={12} className="mr-2" />
                  Attention
                </span>
                <span className="inspector-state__value inspector-state__value--waiting">{waitingCount}</span>
              </div>
            )}
            {idleCount > 0 && (
              <div className="inspector-state__row">
                <span className="inspector-state__label">
                  <Zap size={12} className="mr-2" />
                  Idle
                </span>
                <span className="inspector-state__value inspector-state__value--idle">{idleCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Commander Status */}
        {commanderState && (
          <div className="inspector-state">
            <div className="inspector-state__content">
              <div className="inspector-state__row">
                <span className="inspector-state__label">
                  <Brain size={12} className="mr-2" />
                  Commander
                </span>
                <span className={`inspector-state__value inspector-state__value--${commanderState.status === "working" ? "working" : commanderState.status === "waiting_for_input" ? "idle" : "idle"}`}>
                  {commanderState.status === "working" ? "Thinking" : "Ready"}
                </span>
              </div>
              {commanderState.queuedPrompts > 0 && (
                <div className="inspector-state__row">
                  <span className="inspector-state__label">Queued</span>
                  <span className="inspector-state__value inspector-state__value--waiting">{commanderState.queuedPrompts}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Fleet Events */}
        {fleetEvents.length > 0 && (
          <div className="inspector-fleet-events">
            <div className="inspector-fleet-events__content">
              {fleetEvents.slice(0, 5).map((event) => (
                <div key={event.eventId} className="inspector-fleet-events__entry">
                  <span className="inspector-fleet-events__type">{event.type}</span>
                  {event.projectId && (
                    <span className="inspector-fleet-events__project">
                      {event.projectId.split("/").pop()?.slice(0, 12)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gateway Status */}
        {gatewayStatus !== "connected" && (
          <div className="inspector-gateway">
            <div className="inspector-gateway__content">
              <span className={`inspector-gateway__status inspector-gateway__status--${gatewayStatus}`}>
                {gatewayStatus === "connecting" && <Loader2 size={12} className="animate-spin" />}
                {gatewayStatus === "disconnected" && <WifiOff size={12} />}
                {gatewayStatus === "connecting" ? "Connecting..." : "Disconnected"}
              </span>
              {gatewayStatus === "disconnected" && onReconnect && (
                <button
                  className="inspector-gateway__reconnect"
                  onClick={onReconnect}
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    );
  }

  // Empty state - minimal and helpful
  if (!session) {
    return (
      <aside className="fleet-intel">
        <div className="intel-empty">
          <div className="intel-empty__title">Select an agent</div>
          <div className="intel-empty__subtitle">Click on an agent in the roster to view its status and details</div>
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
          {session.gitBranch && mission !== session.gitBranch && (
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
          {onQuickAction ? (
            <div className="inspector-ask__actions">
              <button
                className="inspector-ask__btn inspector-ask__btn--approve"
                onClick={() => onQuickAction("approve")}
              >
                <Check size={14} />
                Approve
              </button>
              <button
                className="inspector-ask__btn inspector-ask__btn--deny"
                onClick={() => onQuickAction("deny")}
              >
                <X size={14} />
                Deny
              </button>
            </div>
          ) : (
            <div className="inspector-ask__hint">
              Select session to approve or deny
            </div>
          )}
        </div>
      )}

      {/* Live State Section - Minimal */}
      <div className="inspector-state">
        <div className="inspector-state__content">
          <div className="inspector-state__row">
            <span className={`inspector-state__value inspector-state__value--${status}`}>{nowText}</span>
          </div>
          <div className="inspector-state__row">
            <span className="inspector-state__value inspector-state__value--mono" title={session.cwd}>
              {session.cwd.length > 35 ? "..." + session.cwd.slice(-32) : session.cwd}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Output removed - Timeline is the primary view */}

      {/* File Status (if available) - Minimal */}
      {session.fileStatus && (session.fileStatus.task || session.fileStatus.summary) && (
        <div className="inspector-file-status">
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

      {/* Gateway Status - Minimal, only show when disconnected */}
      {gatewayStatus !== "connected" && (
        <div className="inspector-gateway">
          <div className="inspector-gateway__content">
            <span className={`inspector-gateway__status inspector-gateway__status--${gatewayStatus}`}>
              {gatewayStatus === "connecting" && <Loader2 size={12} className="animate-spin" />}
              {gatewayStatus === "disconnected" && <WifiOff size={12} />}
              {gatewayStatus === "connecting" ? "Connecting..." : "Disconnected"}
            </span>
            {gatewayStatus === "disconnected" && onReconnect && (
              <button
                className="inspector-gateway__reconnect"
                onClick={onReconnect}
              >
                Reconnect
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
