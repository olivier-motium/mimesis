/**
 * TacticalIntel - Right sidebar contextual intel panel (Zone C)
 *
 * SIMPLIFIED: Shows contextual information based on current mode.
 * Stats are in Roster (left) - this panel shows details and actions.
 *
 * Layout:
 * ┌─────────────────────────┐
 * │ MODE CONTEXT            │ ← Commander status OR Agent details
 * ├─────────────────────────┤
 * │ QUICK ACTIONS           │ ← Only when needs approval
 * ├─────────────────────────┤
 * │ ACTIVITY LOG            │ ← Recent fleet events
 * └─────────────────────────┘
 */

import { GitBranch, AlertTriangle, WifiOff, Loader2, Check, X, Brain, Eye, Activity } from "lucide-react";
import { getMissionText, getNowText, formatTimeAgo } from "./constants";
import { getEffectiveStatus } from "@/lib/sessionStatus";
import { KBPanel } from "./KBPanel";
import type { TacticalIntelProps } from "./types";

export function TacticalIntel({ session, fleetEvents = [], gatewayStatus = "disconnected", onQuickAction, onReconnect, showCommander, commanderState }: TacticalIntelProps) {
  // Get selected session info if available
  const sessionInfo = session ? {
    ...getEffectiveStatus(session),
    mission: getMissionText(session),
    nowText: getNowText(session),
    isWaitingForAction: getEffectiveStatus(session).status === "waiting" && session.hasPendingToolUse,
  } : null;

  return (
    <aside className="fleet-intel">
      {/* Panel Header - Matches CommandBar height */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          {showCommander ? (
            <Brain size={14} className="text-purple-500" />
          ) : (
            <Eye size={14} className="text-muted-foreground" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
            {showCommander ? "Commander" : "Agent Intel"}
          </span>
        </div>
        {gatewayStatus === "connected" ? (
          <span className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: "var(--nb-green)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Live
          </span>
        ) : gatewayStatus === "connecting" ? (
          <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Loader2 size={10} className="animate-spin" />
            Connecting
          </span>
        ) : (
          <button
            onClick={onReconnect}
            className="text-[10px] font-medium text-destructive hover:underline flex items-center gap-1"
          >
            <WifiOff size={10} />
            Reconnect
          </button>
        )}
      </div>

      {/* Commander Status - when Commander tab is active */}
      {showCommander && commanderState && (
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Brain size={16} className="text-purple-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Commander</div>
              <div className={`text-xs ${commanderState.status === "working" ? "text-purple-500" : "text-muted-foreground"}`}>
                {commanderState.status === "working" ? "Processing..." : "Ready for prompts"}
              </div>
            </div>
          </div>

          {commanderState.queuedPrompts > 0 && (
            <div className="px-3 py-2 rounded-md bg-muted/30 text-xs">
              <span className="text-muted-foreground">Queued: </span>
              <span className="font-medium text-amber-500">{commanderState.queuedPrompts}</span>
            </div>
          )}

          <div className="mt-4 text-xs text-muted-foreground">
            Ask about fleet status, coordinate across projects, or get summaries of agent work.
          </div>
        </div>
      )}

      {/* Knowledge Base Panel - when Commander tab is active */}
      {showCommander && (
        <div className="flex-1 overflow-hidden">
          <KBPanel />
        </div>
      )}

      {/* Selected Agent Section */}
      {!showCommander && session && sessionInfo && (
        <>
          {/* Agent Details - Primary content */}
          <div className="p-4 flex-1">
            {/* Status + Time header */}
            <div className="flex items-center justify-between mb-3">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                sessionInfo.status === "working" ? "bg-status-working/15 text-status-working" :
                sessionInfo.status === "waiting" ? "bg-status-waiting/15 text-status-waiting" :
                sessionInfo.fileStatusValue === "error" ? "bg-status-error/15 text-status-error" :
                "bg-muted/30 text-muted-foreground"
              }`}>
                {sessionInfo.fileStatusValue === "error" ? "Error" :
                 sessionInfo.status === "working" ? "Working" :
                 sessionInfo.status === "waiting" ? "Waiting" : "Idle"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatTimeAgo(session.lastActivityAt)}
              </span>
            </div>

            {/* Mission text - prominent */}
            <div className="text-sm font-medium text-foreground leading-snug mb-3 line-clamp-3" title={sessionInfo.mission}>
              {sessionInfo.mission}
            </div>

            {/* Context chips */}
            <div className="flex flex-wrap gap-1.5">
              {session.gitBranch && sessionInfo.mission !== session.gitBranch && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/30 text-[10px] text-muted-foreground font-mono">
                  <GitBranch size={10} />
                  {session.gitBranch}
                </span>
              )}
              {session.gitRepoId && (
                <span className="px-2 py-0.5 rounded bg-muted/30 text-[10px] text-muted-foreground font-mono">
                  {session.gitRepoId.split("/").pop()}
                </span>
              )}
              {session.compactionCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-[10px] text-amber-500 font-mono">
                  ↻{session.compactionCount}
                </span>
              )}
            </div>
          </div>

          {/* Quick Actions - Only when waiting for approval */}
          {sessionInfo.isWaitingForAction && session.pendingTool && (
            <div className="mx-4 mb-4 p-3 rounded-lg border border-status-waiting/30 bg-status-waiting/5">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-status-waiting">
                <AlertTriangle size={12} />
                Requires Action
              </div>
              <div className="mb-3 p-2 rounded bg-background/50 font-mono text-[11px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-muted-foreground">Tool:</span>
                  <span className="text-foreground font-medium">{session.pendingTool.tool}</span>
                </div>
                {session.pendingTool.target && (
                  <div className="text-muted-foreground break-all" title={session.pendingTool.target}>
                    {session.pendingTool.target.length > 60
                      ? session.pendingTool.target.slice(0, 57) + "..."
                      : session.pendingTool.target}
                  </div>
                )}
              </div>
              {onQuickAction ? (
                <div className="flex gap-2">
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-status-working text-background text-xs font-medium hover:opacity-90 transition-opacity"
                    onClick={() => onQuickAction("approve")}
                  >
                    <Check size={12} />
                    Approve
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-status-error text-background text-xs font-medium hover:opacity-90 transition-opacity"
                    onClick={() => onQuickAction("deny")}
                  >
                    <X size={12} />
                    Deny
                  </button>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground italic">
                  Select session to approve or deny
                </div>
              )}
            </div>
          )}

          {/* Now Activity - only show if has meaningful context beyond status */}
          {sessionInfo.nowText &&
           sessionInfo.nowText !== "Idle" &&
           sessionInfo.nowText !== "Working" &&
           sessionInfo.nowText !== "Waiting" && (
            <div className="px-4 pb-3">
              <div className={`text-xs font-mono ${
                sessionInfo.status === "working" ? "text-status-working" :
                sessionInfo.status === "waiting" ? "text-status-waiting" :
                "text-muted-foreground"
              }`}>
                {sessionInfo.nowText}
              </div>
            </div>
          )}

          {/* File Status - task/summary from .claude/status.md */}
          {session.fileStatus && (session.fileStatus.task || session.fileStatus.summary) && (
            <div className="px-4 py-3 border-t border-border/50 mt-auto">
              {session.fileStatus.task && (
                <div className="text-xs font-medium text-foreground mb-1">
                  {session.fileStatus.task}
                </div>
              )}
              {session.fileStatus.summary && (
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  {session.fileStatus.summary}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state - no session selected */}
      {!showCommander && !session && (
        <div className="flex-1 flex flex-col p-4">
          {/* Helpful guidance */}
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center mb-3">
              <Eye size={18} className="text-muted-foreground" />
            </div>
            <div className="text-sm font-medium text-foreground mb-1">Select an agent</div>
            <div className="text-xs text-muted-foreground mb-3 max-w-[180px]">
              View status, approve actions, and monitor progress
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono text-foreground">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono text-foreground">↓</kbd>
              <span className="ml-1">to navigate</span>
            </div>
          </div>

          {/* Commander hint at bottom */}
          <div className="border-t border-border/50 pt-3 mt-auto">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-purple-500/5 border border-purple-500/20 hover:bg-purple-500/10 hover:border-purple-500/30 transition-colors cursor-pointer">
              <Brain size={14} className="text-purple-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground">Commander</div>
                <div className="text-[10px] text-muted-foreground">Fleet coordination & queries</div>
              </div>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[9px] font-mono text-muted-foreground flex-shrink-0">Ctrl+Tab</kbd>
            </div>
          </div>
        </div>
      )}

      {/* Recent Fleet Events - at bottom */}
      {fleetEvents.length > 0 && (
        <div className="mt-auto border-t border-border/50">
          <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Activity size={10} />
            Recent Activity
          </div>
          <div className="px-4 pb-3 space-y-1">
            {fleetEvents.slice(0, 3).map((event) => (
              <div key={event.eventId} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/20 text-[10px]">
                <span className="text-muted-foreground font-mono">{event.type}</span>
                {event.projectId && (
                  <span className="text-muted-foreground/70 truncate">
                    {event.projectId.split("/").pop()?.slice(0, 12)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
