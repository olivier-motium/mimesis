/**
 * useCommanderEvents - Process Commander content events for Timeline rendering.
 *
 * Transforms raw session events from JSONL parsing into grouped Timeline events.
 * Reuses the groupEventsForTimeline logic from useSessionEvents.
 */

import { useMemo } from "react";
import type { SequencedSessionEvent } from "./useGateway";
import { groupEventsForTimeline, type TimelineEvent } from "./useSessionEvents";

// ============================================================================
// Types
// ============================================================================

export interface UseCommanderEventsResult {
  /** Events ready for Timeline rendering */
  events: TimelineEvent[];
  /** Whether there's any content to display */
  hasContent: boolean;
  /** Total event count */
  eventCount: number;
}

// ============================================================================
// Hook
// ============================================================================

export function useCommanderEvents(
  contentEvents: SequencedSessionEvent[]
): UseCommanderEventsResult {
  // Group events for Timeline rendering
  const events = useMemo(() => {
    return groupEventsForTimeline(contentEvents);
  }, [contentEvents]);

  return useMemo(
    () => ({
      events,
      hasContent: events.length > 0,
      eventCount: contentEvents.length,
    }),
    [events, contentEvents.length]
  );
}
