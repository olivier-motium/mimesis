/**
 * TacticalIntel - Right sidebar Fleet Intel Panel (Zone C)
 *
 * REDESIGNED: Always shows fleet context at top, with selected agent details below.
 * This maintains "overview sidebar" semantics while adding detail when available.
 *
 * Layout:
 * ┌─────────────────────────┐
 * │ FLEET OVERVIEW          │ ← Always visible: agents, working, attention
 * ├─────────────────────────┤
 * │ SELECTED AGENT          │ ← Only when session selected
 * │ Mission + Status        │
 * ├─────────────────────────┤
 * │ QUICK ACTIONS           │ ← Only when needs approval
 * └─────────────────────────┘
 */

import { GitBranch, AlertTriangle, WifiOff, Loader2, Check, X, Brain, Users, Activity, Zap, Eye, ChevronRight } from "lucide-react";
import { getMissionText, getNowText, formatTimeAgo } from "./constants";
import { getEffectiveStatus } from "@/lib/sessionStatus";
import type { TacticalIntelProps } from "./types";

export function TacticalIntel({ session, fleetEvents = [], gatewayStatus = "disconnected", onQuickAction, onReconnect, showCommander, commanderState, sessions = [] }: TacticalIntelProps) {
  // Calculate fleet stats - always needed for overview
  const workingCount = sessions.filter(s => getEffectiveStatus(s).status === "working").length;
  const waitingCount = sessions.filter(s => {
    const { status } = getEffectiveStatus(s);
    return status === "waiting" && s.hasPendingToolUse;
  }).length;
  const idleCount = sessions.filter(s => getEffectiveStatus(s).status === "idle").length;

  // Get selected session info if available
  const sessionInfo = session ? {
    ...getEffectiveStatus(session),
    mission: getMissionText(session),
    nowText: getNowText(session),
    isWaitingForAction: getEffectiveStatus(session).status === "waiting" && session.hasPendingToolUse,
  } : null;

  return (
    <aside className="fleet-intel">
      {/* Fleet Overview - ALWAYS VISIBLE */}
      <div className="inspector-hud">
        <div className="inspector-hud__header">
          <span className="inspector-hud__status inspector-hud__status--working">
            Fleet Intel
          </span>
          {gatewayStatus === "connected" && (
            <span className="inspector-hud__time" style={{ color: "var(--nb-green)" }}>
              ● Live
            </span>
          )}
        </div>

        {/* Fleet Stats - Grid layout for better readability */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30">
            <Users size={12} className="text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold">{sessions.length}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Agents</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: workingCount > 0 ? "rgba(90, 143, 117, 0.1)" : "rgba(255,255,255,0.03)" }}>
            <Activity size={12} style={{ color: workingCount > 0 ? "var(--nb-green)" : "var(--nb-text-muted)" }} />
            <div className="flex flex-col">
              <span className="text-xs font-semibold" style={{ color: workingCount > 0 ? "var(--nb-green)" : "var(--nb-text-dim)" }}>{workingCount}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Working</span>
            </div>
          </div>
          {(waitingCount > 0 || sessions.length === 0) && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: waitingCount > 0 ? "rgba(212, 165, 116, 0.1)" : "rgba(255,255,255,0.03)" }}>
              <AlertTriangle size={12} style={{ color: waitingCount > 0 ? "var(--nb-yellow)" : "var(--nb-text-muted)" }} />
              <div className="flex flex-col">
                <span className="text-xs font-semibold" style={{ color: waitingCount > 0 ? "var(--nb-yellow)" : "var(--nb-text-dim)" }}>{waitingCount}</span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Attention</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20">
            <Zap size={12} className="text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-muted-foreground">{idleCount}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Idle</span>
            </div>
          </div>
        </div>
      </div>

      {/* Commander Status - when Commander tab is active */}
      {showCommander && commanderState && (
        <div className="inspector-state">
          <div className="inspector-state__content">
            <div className="inspector-state__row">
              <span className="inspector-state__label">
                <Brain size={12} className="mr-2" />
                Commander
              </span>
              <span className={`inspector-state__value inspector-state__value--${commanderState.status === "working" ? "working" : "idle"}`}>
                {commanderState.status === "working" ? "Thinking..." : "Ready"}
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

      {/* Selected Agent Section */}
      {!showCommander && session && sessionInfo && (
        <>
          {/* Agent Header */}
          <div className="inspector-state" style={{ borderTop: "1px solid var(--nb-border-dim)", marginTop: "8px", paddingTop: "12px" }}>
            <div className="flex items-center gap-2 mb-2">
              <Eye size={11} className="text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Selected Agent</span>
            </div>

            {/* Mission + Status */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`inspector-hud__status inspector-hud__status--${sessionInfo.status}`}>
                  {sessionInfo.fileStatusValue === "error" ? "Error" : sessionInfo.status === "working" ? "Working" : sessionInfo.status === "waiting" ? "Waiting" : "Idle"}
                </span>
                <span className="inspector-hud__time">
                  {formatTimeAgo(session.lastActivityAt)}
                </span>
              </div>
              <div className="text-sm font-medium text-foreground line-clamp-2" title={sessionInfo.mission}>
                {sessionInfo.mission}
              </div>
            </div>

            {/* Context chips */}
            <div className="inspector-hud__context">
              {session.gitBranch && sessionInfo.mission !== session.gitBranch && (
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

          {/* Quick Actions - Only when waiting for approval */}
          {sessionInfo.isWaitingForAction && session.pendingTool && (
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

          {/* Now Activity */}
          {sessionInfo.nowText && sessionInfo.nowText !== "Idle" && (
            <div className="inspector-state">
              <div className="inspector-state__content">
                <div className="inspector-state__row">
                  <span className={`inspector-state__value inspector-state__value--${sessionInfo.status}`}>{sessionInfo.nowText}</span>
                </div>
              </div>
            </div>
          )}

          {/* File Status */}
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
        </>
      )}

      {/* Empty state - no session selected */}
      {!showCommander && !session && (
        <div style={{ borderTop: "1px solid var(--nb-border-dim)", marginTop: "12px", paddingTop: "16px", flex: 1 }}>
          <div className="flex items-center gap-2 mb-3 px-4">
            <Eye size={11} className="text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Agent Inspector</span>
          </div>
          <div className="intel-empty" style={{ paddingTop: "24px" }}>
            <div className="p-4 rounded-lg bg-muted/20 border border-border/50 text-center max-w-[220px]">
              <ChevronRight size={20} className="intel-empty__icon mx-auto mb-2" style={{ opacity: 0.5 }} />
              <div className="text-sm font-medium text-foreground mb-1">Select an agent</div>
              <div className="text-[11px] text-muted-foreground mb-3">
                View real-time status, approve actions, and monitor progress
              </div>
              <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">↓</kbd>
                <span className="ml-1">to navigate</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Fleet Events */}
      {fleetEvents.length > 0 && (
        <div className="inspector-fleet-events" style={{ marginTop: "auto" }}>
          <div className="flex items-center gap-2 mb-2">
            <Activity size={10} className="text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Recent Activity</span>
          </div>
          <div className="inspector-fleet-events__content">
            {fleetEvents.slice(0, 3).map((event) => (
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

      {/* Gateway Status - only when disconnected */}
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
