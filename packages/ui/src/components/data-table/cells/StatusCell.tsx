/**
 * StatusCell - Status indicator with tooltip
 */

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getEffectiveStatus } from "@/lib/sessionStatus"
import type { Session } from "@/types/schema"
import { cn } from "@/lib/utils"

const STATUS_ICONS: Record<string, string> = {
  working: "●",
  waiting: "○",
  idle: "◐",
}

const STATUS_LABELS: Record<string, string> = {
  working: "Working - Claude is actively processing",
  waiting: "Waiting - Needs your input or approval",
  idle: "Idle - Session is inactive",
}

interface StatusCellProps {
  session: Session
}

export function StatusCell({ session }: StatusCellProps) {
  const { status } = getEffectiveStatus(session)
  const hasCompaction = session.compactionCount > 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "text-base font-bold",
                status === "working" && "text-status-working",
                status === "waiting" && "text-status-waiting",
                status === "idle" && "text-status-idle"
              )}
              aria-label={STATUS_LABELS[status]}
            >
              {STATUS_ICONS[status]}
            </span>
            {hasCompaction && (
              <span className="text-[10px] text-muted-foreground">
                ↻{session.compactionCount}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{STATUS_LABELS[status]}</p>
          {hasCompaction && (
            <p className="text-xs text-muted-foreground mt-1">
              Compacted {session.compactionCount} time{session.compactionCount === 1 ? "" : "s"}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
