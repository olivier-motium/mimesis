/**
 * TimelineProgress - Renders progress indicators.
 *
 * Shows loading states, spinners, and percentage progress.
 */

import type { ProgressEvent } from "../../hooks/useSessionEvents";
import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface TimelineProgressProps {
  event: ProgressEvent;
}

// ============================================================================
// Component
// ============================================================================

export function TimelineProgress({ event }: TimelineProgressProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      {event.message && (
        <span className="text-xs text-muted-foreground">{event.message}</span>
      )}
      {event.percentage !== undefined && (
        <div className="flex-1 max-w-32">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full bg-primary transition-all duration-300"
              )}
              style={{ width: `${event.percentage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
