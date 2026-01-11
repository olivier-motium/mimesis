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

  // Truncate preview
  const preview = event.thinking.slice(0, 100).replace(/\n/g, " ");
  const hasMore = event.thinking.length > 100;

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border/50",
        "bg-muted/20"
      )}
    >
      {/* Header */}
      <button
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2",
          "text-left hover:bg-muted/30 transition-colors"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse */}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}

        {/* Icon */}
        <Brain className="w-4 h-4 text-muted-foreground" />

        {/* Label */}
        <span className="text-xs text-muted-foreground font-medium">Thinking</span>

        {/* Preview (when collapsed) */}
        {!isExpanded && (
          <span className="flex-1 text-xs text-muted-foreground/70 truncate italic">
            {preview}{hasMore && "..."}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {event.thinking}
          </p>
        </div>
      )}
    </div>
  );
}
