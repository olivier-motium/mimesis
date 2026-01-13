/**
 * KBPanel - Knowledge Base management panel for Commander
 *
 * Shows project list with sync status, statistics, and sync controls.
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │ Knowledge Base               [Sync All] │
 * ├─────────────────────────────────────────┤
 * │ Project  │ Last Sync │ Status │ Actions │
 * │ mvp      │ 2d ago    │ Fresh  │ [Sync]  │
 * │ mimesis  │ 8d ago    │ Stale  │ [Sync]  │
 * │ api-svc  │ Never     │ None   │ [Sync]  │
 * └─────────────────────────────────────────┘
 */

import { useState, useEffect } from "react";
import {
  RefreshCw,
  Database,
  AlertTriangle,
  Check,
  X,
  FileText,
  Loader2,
} from "lucide-react";
import { useKBState } from "../../hooks/useKBState";
import type { KBProject } from "../../lib/kb-api";

/** Format relative time from ISO string */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Never";

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/** Status badge info with tooltip descriptions */
interface StatusBadge {
  label: string;
  className: string;
  icon: typeof Check;
  tooltip: string;
}

/** Get status badge for a project */
function getStatusBadge(project: KBProject): StatusBadge {
  if (!project.hasKb) {
    return {
      label: "None",
      className: "bg-muted/30 text-muted-foreground",
      icon: X,
      tooltip: "No knowledge base exists yet. Run /knowledge-sync to create one.",
    };
  }
  if (project.isStale) {
    return {
      label: "Stale",
      className: "bg-amber-500/15 text-amber-500",
      icon: AlertTriangle,
      tooltip: "KB is over 7 days old and may be outdated. Consider syncing.",
    };
  }
  return {
    label: "Fresh",
    className: "bg-status-working/15 text-status-working",
    icon: Check,
    tooltip: "KB was synced within the last 7 days.",
  };
}

interface KBPanelProps {
  /** Callback when sync is triggered (to show message in Commander) */
  onSyncMessage?: (message: string) => void;
}

export function KBPanel({ onSyncMessage }: KBPanelProps) {
  const [state, actions] = useKBState(true, 30000); // Auto-refresh every 30s
  const [syncingProject, setSyncingProject] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Auto-dismiss sync message after 15 seconds (enough time to read the command)
  useEffect(() => {
    if (syncMessage) {
      const timer = setTimeout(() => setSyncMessage(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [syncMessage]);

  const handleSyncAll = async (full: boolean = false) => {
    setSyncingAll(true);
    setSyncMessage(null);
    try {
      const result = await actions.syncAll(full);
      setSyncMessage(result.message);
      onSyncMessage?.(result.message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      setSyncMessage(`Error: ${msg}`);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSyncProject = async (projectId: string, full: boolean = false) => {
    setSyncingProject(projectId);
    setSyncMessage(null);
    try {
      const result = await actions.syncProject(projectId, full);
      setSyncMessage(result.message);
      onSyncMessage?.(result.message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      setSyncMessage(`Error: ${msg}`);
    } finally {
      setSyncingProject(null);
    }
  };

  // Loading state
  if (state.loading && state.projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <Loader2 size={24} className="animate-spin mb-3" />
        <span className="text-sm">Loading Knowledge Base...</span>
      </div>
    );
  }

  // Not initialized state
  if (!state.initialized) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-lg bg-muted/30 flex items-center justify-center mb-4">
          <Database size={24} className="text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-2">
          Knowledge Base Not Initialized
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-[240px]">
          {syncMessage || state.message || "Run /knowledge-sync to populate the knowledge base."}
        </p>
        {syncMessage ? (
          <div className="text-xs text-purple-500 bg-purple-500/10 px-3 py-2 rounded-md font-mono">
            /knowledge-sync
          </div>
        ) : (
          <button
            onClick={() => handleSyncAll()}
            disabled={syncingAll}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-purple-500/10 text-purple-500 text-sm font-medium hover:bg-purple-500/20 transition-colors disabled:opacity-50"
          >
            {syncingAll ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Initialize KB
          </button>
        )}
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-destructive" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-2">
          Error Loading KB
        </h3>
        <p className="text-xs text-muted-foreground mb-4">{state.error}</p>
        <button
          onClick={() => actions.refresh()}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-purple-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
            Knowledge Base
          </span>
          {state.loading && (
            <Loader2 size={12} className="animate-spin text-muted-foreground" />
          )}
        </div>
        <button
          onClick={() => handleSyncAll()}
          disabled={syncingAll}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-purple-500 hover:bg-purple-500/10 transition-colors disabled:opacity-50"
          title="Get command to sync all projects (run in Commander)"
        >
          {syncingAll ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          Sync All
        </button>
      </div>

      {/* Stats bar */}
      {state.stats && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border/30 bg-muted/20 text-[10px]">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{state.stats.totalProjects}</span> projects
          </span>
          {state.stats.staleProjects > 0 && (
            <span className="text-amber-500">
              <span className="font-medium">{state.stats.staleProjects}</span> stale
            </span>
          )}
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{state.stats.totalBriefings}</span> briefings (14d)
          </span>
        </div>
      )}

      {/* Sync message feedback */}
      {syncMessage && (
        <div className={`mx-4 mt-2 mb-2 p-3 rounded-md ${
          syncMessage.startsWith("Error:")
            ? "bg-destructive/10 border border-destructive/20"
            : "bg-purple-500/10 border border-purple-500/20"
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className={`text-xs font-medium mb-1 ${
                syncMessage.startsWith("Error:") ? "text-destructive" : "text-purple-500"
              }`}>
                {syncMessage.startsWith("Error:") ? "Sync Failed" : "Run in Commander"}
              </div>
              <div className="text-[11px] text-foreground/80 font-mono break-words">
                {syncMessage}
              </div>
            </div>
            <button
              onClick={() => setSyncMessage(null)}
              className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        {state.projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <FileText size={24} className="text-muted-foreground mb-3" />
            <p className="text-xs text-muted-foreground">
              No projects found. Register projects via Fleet sessions.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {state.projects.map((project) => {
              const status = getStatusBadge(project);
              const StatusIcon = status.icon;
              const isSyncing = syncingProject === project.projectId;

              return (
                <div
                  key={project.projectId}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  {/* Project name */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate" title={project.projectId}>
                      {project.name}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{formatRelativeTime(project.lastSyncAt)}</span>
                      {project.briefingCount > 0 && (
                        <>
                          <span className="text-border">•</span>
                          <span>{project.briefingCount} briefings</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status badge with tooltip */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium cursor-help ${status.className}`}
                    title={status.tooltip}
                  >
                    <StatusIcon size={10} />
                    {status.label}
                  </span>

                  {/* Get sync command button */}
                  <button
                    onClick={() => handleSyncProject(project.projectId)}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
                    title={`Get sync command for ${project.name} (run in Commander)`}
                  >
                    {isSyncing ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-border/50 bg-muted/10">
        <p className="text-[10px] text-muted-foreground">
          Use <code className="px-1 py-0.5 bg-muted rounded font-mono">/kb &lt;project&gt;</code> or{" "}
          <code className="px-1 py-0.5 bg-muted rounded font-mono">/improve &lt;project&gt;</code> in Commander
        </p>
      </div>
    </div>
  );
}
