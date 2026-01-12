/**
 * TimelineThinking - Renders model thinking/reasoning blocks.
 *
 * Collapsed by default, with dimmed styling to de-emphasize.
 */

import { useState } from "react";
import type { ThinkingEvent } from "../../hooks/useSessionEvents";
import { cn } from "../../lib/utils";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface TimelineThinkingProps {
  event: ThinkingEvent;
  defaultExpanded?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function TimelineThinking({ event, defaultExpanded = false }: TimelineThinkingProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Truncate preview to show more context
  const preview = event.thinking.slice(0, 150).replace(/\n/g, " ");
  const hasMore = event.thinking.length > 150;

  return (
    <div className="rounded-sm border border-dashed border-border/30 bg-muted/5">
      {/* Header - inline with preview for density */}
      <button
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-0.5",
          "text-left hover:bg-muted/20 transition-colors"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
        )}
        <Brain className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
        <span className="text-xs text-muted-foreground/70 flex-shrink-0">Thinking</span>
        {!isExpanded && (
          <span className="flex-1 text-xs text-muted-foreground/50 truncate italic ml-1">
            {preview}{hasMore && "..."}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2 py-1 border-t border-border/20">
          <p className="text-xs text-muted-foreground/80 whitespace-pre-wrap leading-snug max-h-40 overflow-y-auto">
            {event.thinking}
          </p>
        </div>
      )}
    </div>
  );
}
