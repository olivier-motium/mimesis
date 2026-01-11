/**
 * TimelineStatusChange - Renders session status change notifications.
 *
 * Shows when the session transitions between working/waiting/idle.
 */

import type { StatusChangeEvent } from "../../hooks/useSessionEvents";
import { cn } from "../../lib/utils";
import { Circle, Pause, Clock } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface TimelineStatusChangeProps {
  event: StatusChangeEvent;
}

const STATUS_CONFIG = {
  working: {
    icon: Circle,
    label: "Working",
    className: "text-green-500",
    bgClassName: "bg-green-500/10",
  },
  waiting: {
    icon: Pause,
    label: "Waiting for input",
    className: "text-yellow-500",
    bgClassName: "bg-yellow-500/10",
  },
  idle: {
    icon: Clock,
    label: "Idle",
    className: "text-muted-foreground",
    bgClassName: "bg-muted/30",
  },
} as const;

// ============================================================================
// Component
// ============================================================================

export function TimelineStatusChange({ event }: TimelineStatusChangeProps) {
  const config = STATUS_CONFIG[event.status];
  const Icon = config.icon;

  return (
    <div className={cn(
      "flex items-center justify-center gap-2 py-1.5 px-3 rounded-full mx-auto w-fit",
      config.bgClassName
    )}>
      <Icon className={cn("w-3 h-3", config.className)} />
      <span className={cn("text-xs font-medium", config.className)}>
        {config.label}
      </span>
    </div>
  );
}
