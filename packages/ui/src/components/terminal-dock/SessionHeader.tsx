/**
 * SessionHeader - Header bar for the TerminalDock
 *
 * Shows:
 * - Session goal/status
 * - Branch info
 * - Terminal status
 * - Close button
 */

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import type { Session } from "../../types/schema";

interface SessionHeaderProps {
  session: Session;
  isConnected: boolean;
  isLoading: boolean;
  onClose: () => void;
  onReconnect?: () => void;
}

const STATUS_STYLES = {
  working: "bg-status-working/10 text-status-working border-status-working/20",
  waiting: "bg-status-waiting/10 text-status-waiting border-status-waiting/20",
  idle: "bg-status-idle/10 text-status-idle border-status-idle/20",
} as const;

const STATUS_LABELS = {
  working: "Working",
  waiting: "Waiting",
  idle: "Idle",
} as const;

export function SessionHeader({
  session,
  isConnected,
  isLoading,
  onClose,
  onReconnect,
}: SessionHeaderProps) {
  const { status } = getEffectiveStatus(session);
  const goalText = session.goal || session.originalPrompt.slice(0, 50);

  return (
    <div className="terminal-dock-header flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Status badge */}
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border",
            STATUS_STYLES[status]
          )}
        >
          {STATUS_LABELS[status]}
        </span>

        {/* Goal text */}
        <span className="text-sm font-medium truncate flex-1">
          {goalText}
        </span>

        {/* Branch */}
        {session.gitBranch && (
          <code className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded font-mono">
            {session.gitBranch.length > 20
              ? session.gitBranch.slice(0, 17) + "..."
              : session.gitBranch}
          </code>
        )}

        {/* Connection status */}
        {!isConnected && !isLoading && onReconnect ? (
          <button
            onClick={onReconnect}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border",
              "bg-status-idle/10 text-status-idle border-status-idle/20",
              "hover:bg-status-idle/20 hover:border-status-idle/40 transition-colors cursor-pointer"
            )}
            title="Click to reconnect"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-status-idle" />
            Offline · Reconnect
          </button>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border",
              isLoading
                ? "bg-status-waiting/10 text-status-waiting border-status-waiting/20"
                : "bg-status-working/10 text-status-working border-status-working/20"
            )}
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              isLoading ? "bg-status-waiting animate-pulse" : "bg-status-working"
            )} />
            {isLoading ? "Connecting..." : "Connected"}
          </span>
        )}
      </div>

      {/* Close button */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        title="Close terminal"
        className="h-7 w-7"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
