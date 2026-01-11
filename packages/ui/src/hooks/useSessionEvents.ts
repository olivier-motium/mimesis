/**
 * useSessionEvents - Session event stream for Timeline rendering.
 *
 * Provides:
 * - Filtered events for the currently attached session
 * - Auto-scroll state management
 * - Event grouping helpers for tool output association
 */

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { SequencedSessionEvent, UseGatewayResult } from "./useGateway";

// ============================================================================
// Types
// ============================================================================

/** Tool event with associated stdout output grouped together */
export interface GroupedToolEvent {
  type: "tool_group";
  seq: number;
  sessionId: string;
  timestamp: string;
  // Tool metadata
  toolName: string;
  toolInput: unknown;
  // Post-completion data (null if still running)
  toolResult: unknown | null;
  ok: boolean | null;
  completedAt: string | null;
  // Associated stdout captured between pre and post
  stdout: string[];
}

/** Text event (assistant message) */
export interface TextEvent {
  type: "text";
  seq: number;
  sessionId: string;
  timestamp: string;
  text: string;
}

/** Thinking event (model reasoning) */
export interface ThinkingEvent {
  type: "thinking";
  seq: number;
  sessionId: string;
  timestamp: string;
  thinking: string;
}

/** Standalone stdout (not associated with a tool) */
export interface StdoutEvent {
  type: "stdout";
  seq: number;
  sessionId: string;
  timestamp: string;
  data: string;
}

/** Progress indicator */
export interface ProgressEvent {
  type: "progress";
  seq: number;
  sessionId: string;
  timestamp: string;
  message?: string;
  percentage?: number;
}

/** Status change notification */
export interface StatusChangeEvent {
  type: "status_change";
  seq: number;
  sessionId: string;
  timestamp: string;
  status: "working" | "waiting" | "idle";
}

export type TimelineEvent =
  | GroupedToolEvent
  | TextEvent
  | ThinkingEvent
  | StdoutEvent
  | ProgressEvent
  | StatusChangeEvent;

export interface UseSessionEventsResult {
  /** Events for the attached session, ready for Timeline rendering */
  events: TimelineEvent[];
  /** Raw events without grouping */
  rawEvents: SequencedSessionEvent[];
  /** Whether currently attached to a session */
  isAttached: boolean;
  /** Currently attached session ID */
  attachedSession: string | null;
  /** Whether user has scrolled away from bottom */
  isScrolledAway: boolean;
  /** Mark that user scrolled away */
  setScrolledAway: (away: boolean) => void;
  /** Scroll to bottom and reset scrolledAway */
  scrollToBottom: () => void;
  /** Total event count (for progress indicators) */
  eventCount: number;
  /** Last event sequence number */
  lastSeq: number;
}

// ============================================================================
// Hook
// ============================================================================

export function useSessionEvents(gateway: UseGatewayResult): UseSessionEventsResult {
  const { attachedSession, sessionEvents } = gateway;

  // Scroll state
  const [isScrolledAway, setScrolledAway] = useState(false);
  const scrollToBottomRef = useRef<(() => void) | null>(null);

  // Get raw events for attached session
  const rawEvents = useMemo(() => {
    if (!attachedSession) return [];
    return sessionEvents.get(attachedSession) ?? [];
  }, [attachedSession, sessionEvents]);

  // Group events for Timeline rendering
  const events = useMemo(() => {
    return groupEventsForTimeline(rawEvents);
  }, [rawEvents]);

  // Scroll management
  const scrollToBottom = useCallback(() => {
    setScrolledAway(false);
    scrollToBottomRef.current?.();
  }, []);

  // Auto-scroll to bottom when new events arrive (if not scrolled away)
  useEffect(() => {
    if (!isScrolledAway && rawEvents.length > 0) {
      scrollToBottomRef.current?.();
    }
  }, [rawEvents.length, isScrolledAway]);

  return useMemo(() => ({
    events,
    rawEvents,
    isAttached: attachedSession !== null,
    attachedSession,
    isScrolledAway,
    setScrolledAway,
    scrollToBottom,
    eventCount: rawEvents.length,
    lastSeq: rawEvents.length > 0 ? rawEvents[rawEvents.length - 1].seq : 0,
  }), [
    events,
    rawEvents,
    attachedSession,
    isScrolledAway,
    setScrolledAway,
    scrollToBottom,
  ]);
}

// ============================================================================
// Event Grouping Logic
// ============================================================================

/**
 * Group raw session events into Timeline-friendly format.
 *
 * Strategy:
 * - Tool pre events start a group, capturing subsequent stdout until post
 * - Text, thinking events pass through as-is
 * - Stdout between tools is standalone; stdout during tool is grouped
 * - Status changes and progress pass through
 */
function groupEventsForTimeline(events: SequencedSessionEvent[]): TimelineEvent[] {
  const result: TimelineEvent[] = [];
  let pendingTool: {
    seq: number;
    sessionId: string;
    timestamp: string;
    toolName: string;
    toolInput: unknown;
    stdout: string[];
  } | null = null;

  for (const event of events) {
    switch (event.type) {
      case "tool": {
        if (event.phase === "pre") {
          // Start a new tool group
          // If there was a pending tool without completion, flush it
          if (pendingTool) {
            result.push(createGroupedToolEvent(pendingTool, null, null, null));
          }
          pendingTool = {
            seq: event.seq,
            sessionId: event.sessionId,
            timestamp: event.timestamp,
            toolName: event.tool_name ?? "Unknown",
            toolInput: event.tool_input,
            stdout: [],
          };
        } else if (event.phase === "post") {
          // Complete the tool group
          if (pendingTool) {
            result.push(createGroupedToolEvent(
              pendingTool,
              event.tool_result,
              event.ok ?? true,
              event.timestamp,
            ));
            pendingTool = null;
          } else {
            // Orphan post event - create standalone
            result.push({
              type: "tool_group",
              seq: event.seq,
              sessionId: event.sessionId,
              timestamp: event.timestamp,
              toolName: event.tool_name ?? "Unknown",
              toolInput: event.tool_input,
              toolResult: event.tool_result,
              ok: event.ok ?? true,
              completedAt: event.timestamp,
              stdout: [],
            });
          }
        }
        break;
      }

      case "stdout": {
        if (pendingTool) {
          // Capture stdout within tool execution
          pendingTool.stdout.push(event.data ?? "");
        } else {
          // Standalone stdout
          result.push({
            type: "stdout",
            seq: event.seq,
            sessionId: event.sessionId,
            timestamp: event.timestamp,
            data: event.data ?? "",
          });
        }
        break;
      }

      case "text": {
        // Flush pending tool if any
        if (pendingTool) {
          result.push(createGroupedToolEvent(pendingTool, null, null, null));
          pendingTool = null;
        }
        // Note: daemon sends text events with 'data' property (per protocol.ts)
        result.push({
          type: "text",
          seq: event.seq,
          sessionId: event.sessionId,
          timestamp: event.timestamp,
          text: event.data ?? event.text ?? "",
        });
        break;
      }

      case "thinking": {
        // Don't flush tool - thinking can happen during tool execution
        result.push({
          type: "thinking",
          seq: event.seq,
          sessionId: event.sessionId,
          timestamp: event.timestamp,
          thinking: event.thinking ?? "",
        });
        break;
      }

      case "progress": {
        result.push({
          type: "progress",
          seq: event.seq,
          sessionId: event.sessionId,
          timestamp: event.timestamp,
          message: typeof event.data === "string" ? event.data : undefined,
        });
        break;
      }

      case "status_change": {
        result.push({
          type: "status_change",
          seq: event.seq,
          sessionId: event.sessionId,
          timestamp: event.timestamp,
          status: event.status ?? "idle",
        });
        break;
      }
    }
  }

  // Flush any remaining pending tool
  if (pendingTool) {
    result.push(createGroupedToolEvent(pendingTool, null, null, null));
  }

  return result;
}

function createGroupedToolEvent(
  pending: {
    seq: number;
    sessionId: string;
    timestamp: string;
    toolName: string;
    toolInput: unknown;
    stdout: string[];
  },
  toolResult: unknown | null,
  ok: boolean | null,
  completedAt: string | null,
): GroupedToolEvent {
  return {
    type: "tool_group",
    seq: pending.seq,
    sessionId: pending.sessionId,
    timestamp: pending.timestamp,
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    toolResult,
    ok,
    completedAt,
    stdout: pending.stdout,
  };
}
