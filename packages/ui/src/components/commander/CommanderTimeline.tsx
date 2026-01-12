/**
 * CommanderTimeline - Renders structured Commander content.
 *
 * Displays text, thinking, and tool events from Commander's JSONL parsing.
 * Reuses Timeline components from the session timeline.
 */

import type { TimelineEvent } from "../../hooks/useSessionEvents";
import { TimelineText } from "../timeline/TimelineText";
import { TimelineThinking } from "../timeline/TimelineThinking";
import { TimelineToolStep } from "../timeline/TimelineToolStep";

// ============================================================================
// Types
// ============================================================================

export interface CommanderTimelineProps {
  events: TimelineEvent[];
}

// ============================================================================
// Component
// ============================================================================

export function CommanderTimeline({ events }: CommanderTimelineProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={`${event.type}-${event.seq}`}>
          {event.type === "tool_group" && <TimelineToolStep event={event} />}
          {event.type === "text" && <TimelineText event={event} />}
          {event.type === "thinking" && <TimelineThinking event={event} />}
          {/* Skip stdout, progress, status_change for now - not relevant for Commander */}
        </div>
      ))}
    </div>
  );
}
