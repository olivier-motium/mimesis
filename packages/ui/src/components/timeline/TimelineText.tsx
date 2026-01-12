/**
 * TimelineText - Renders assistant text messages.
 *
 * Compact text display optimized for information density.
 */

import type { TextEvent } from "../../hooks/useSessionEvents";

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
    <div className="text-sm text-foreground leading-snug">
      <div className="whitespace-pre-wrap break-words">{event.text}</div>
    </div>
  );
}
