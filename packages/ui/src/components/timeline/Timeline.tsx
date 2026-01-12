/**
 * Timeline - Virtualized event stream for session display.
 *
 * Renders session events (tool uses, text, thinking, stdout) in a
 * chat-style layout using @tanstack/react-virtual for performance
 * with large event streams.
 */

import { useRef, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TimelineEvent } from "../../hooks/useSessionEvents";
import { TimelineToolStep } from "./TimelineToolStep";
import { TimelineText } from "./TimelineText";
import { TimelineThinking } from "./TimelineThinking";
import { TimelineStdout } from "./TimelineStdout";
import { TimelineProgress } from "./TimelineProgress";
import { TimelineStatusChange } from "./TimelineStatusChange";
import { cn } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface TimelineProps {
  events: TimelineEvent[];
  isScrolledAway: boolean;
  onScrolledAwayChange: (away: boolean) => void;
  className?: string;
}

// Estimated row heights for virtualization (dynamic measurement will refine)
const ESTIMATED_HEIGHTS: Record<TimelineEvent["type"], number> = {
  tool_group: 150,
  text: 120,
  thinking: 80,
  stdout: 40,
  progress: 30,
  status_change: 30,
};

// ============================================================================
// Component
// ============================================================================

export function Timeline({
  events,
  isScrolledAway,
  onScrolledAwayChange,
  className,
}: TimelineProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  // Virtualized list
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => ESTIMATED_HEIGHTS[events[index].type],
    overscan: 5,
    getItemKey: (index) => `${events[index].type}-${events[index].seq}`,
  });

  // Scroll to bottom when new events arrive (if at bottom)
  useEffect(() => {
    if (!isScrolledAway && events.length > 0) {
      // Allow virtualizer to measure before scrolling
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(events.length - 1, { align: "end" });
      });
    }
  }, [events.length, isScrolledAway, virtualizer]);

  // Handle scroll to detect when user scrolls away
  const handleScroll = useCallback(() => {
    const container = parentRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    // Only notify of changes
    if (isAtBottom && isScrolledAway) {
      onScrolledAwayChange(false);
    } else if (!isAtBottom && !isScrolledAway && wasAtBottomRef.current) {
      onScrolledAwayChange(true);
    }

    wasAtBottomRef.current = isAtBottom;
  }, [isScrolledAway, onScrolledAwayChange]);

  // Render individual event
  const renderEvent = (event: TimelineEvent) => {
    switch (event.type) {
      case "tool_group":
        return <TimelineToolStep event={event} />;
      case "text":
        return <TimelineText event={event} />;
      case "thinking":
        return <TimelineThinking event={event} />;
      case "stdout":
        return <TimelineStdout event={event} />;
      case "progress":
        return <TimelineProgress event={event} />;
      case "status_change":
        return <TimelineStatusChange event={event} />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={parentRef}
      className={cn(
        "relative flex-1 overflow-auto",
        "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
        className
      )}
      onScroll={handleScroll}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const event = events[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="px-4 py-2">
                {renderEvent(event)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>No events yet. Waiting for session activity...</p>
        </div>
      )}

      {/* Scroll to bottom button */}
      {isScrolledAway && events.length > 0 && (
        <button
          onClick={() => {
            virtualizer.scrollToIndex(events.length - 1, { align: "end" });
            onScrolledAwayChange(false);
          }}
          className={cn(
            "sticky bottom-4 left-1/2 -translate-x-1/2 z-10",
            "px-3 py-1.5 rounded-full",
            "bg-primary text-primary-foreground",
            "shadow-lg hover:bg-primary/90",
            "text-sm font-medium",
            "transition-opacity"
          )}
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
