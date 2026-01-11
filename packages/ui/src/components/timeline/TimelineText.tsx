/**
 * TimelineText - Renders assistant text messages.
 *
 * Displays streaming text with markdown rendering.
 */

import type { TextEvent } from "../../hooks/useSessionEvents";
import { cn } from "../../lib/utils";
import { MessageSquare } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface TimelineTextProps {
  event: TextEvent;
}

// ============================================================================
// Component
// ============================================================================

export function TimelineText({ event }: TimelineTextProps) {
  return (
    <div className="flex gap-3">
      {/* Icon */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
        <MessageSquare className="w-3.5 h-3.5 text-primary" />
      </div>

      {/* Content */}
      <div className={cn(
        "flex-1 prose prose-sm dark:prose-invert max-w-none",
        "text-foreground"
      )}>
        <p className="whitespace-pre-wrap">{event.text}</p>
      </div>
    </div>
  );
}
