/**
 * Gateway message handlers - Registry pattern for WebSocket message processing.
 *
 * Each handler processes a specific message type from the gateway.
 * This pattern improves testability and reduces cognitive load.
 */

import type {
  FleetEvent,
  SessionState,
  TrackedSession,
  SessionEvent,
  SequencedSessionEvent,
  JobState,
  JobStreamChunk,
  JobResult,
} from "./useGateway";

// ============================================================================
// Handler Types
// ============================================================================

/**
 * State setters passed to handlers for updating React state.
 */
export interface GatewayStateSetters {
  setFleetEvents: React.Dispatch<React.SetStateAction<FleetEvent[]>>;
  setLastEventId: React.Dispatch<React.SetStateAction<number>>;
  setSessions: React.Dispatch<React.SetStateAction<Map<string, SessionState>>>;
  setAttachedSession: React.Dispatch<React.SetStateAction<string | null>>;
  setSessionEvents: React.Dispatch<React.SetStateAction<Map<string, SequencedSessionEvent[]>>>;
  setTrackedSessions: React.Dispatch<React.SetStateAction<Map<string, TrackedSession>>>;
  setActiveJob: React.Dispatch<React.SetStateAction<JobState | null>>;
  setLastError: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Refs for accessing mutable values without recreating handlers.
 */
export interface GatewayRefs {
  lastEventIdRef: React.MutableRefObject<number>;
  attachedSessionRef: React.MutableRefObject<string | null>;
}

export type MessageHandler = (
  message: Record<string, unknown>,
  setters: GatewayStateSetters,
  refs: GatewayRefs
) => void;

// ============================================================================
// Fleet Event Handlers
// ============================================================================

export function handleFleetEvent(
  message: Record<string, unknown>,
  setters: GatewayStateSetters,
  refs: GatewayRefs
): void {
  const event: FleetEvent = {
    eventId: message.event_id as number,
    ts: message.ts as string,
    type: (message.event as Record<string, unknown>).type as string,
    projectId: (message.event as Record<string, unknown>).project_id as string | undefined,
    briefingId: (message.event as Record<string, unknown>).briefing_id as number | undefined,
    data: (message.event as Record<string, unknown>).data,
  };
  setters.setFleetEvents((prev) => [...prev, event]);
  setters.setLastEventId(event.eventId);
  refs.lastEventIdRef.current = event.eventId;
}

// ============================================================================
// PTY Session Handlers
// ============================================================================

export function handleSessionCreated(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const session: SessionState = {
    sessionId: message.session_id as string,
    projectId: message.project_id as string,
    pid: message.pid as number,
    status: "idle",
    attachedClients: 1,
  };
  setters.setSessions((prev) => new Map(prev).set(session.sessionId, session));
  setters.setAttachedSession(session.sessionId);
}

export function handleSessionStatus(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const sessionId = message.session_id as string;
  const status = message.status as "working" | "waiting" | "idle";
  setters.setSessions((prev) => {
    const updated = new Map(prev);
    const existing = updated.get(sessionId);
    if (existing) {
      updated.set(sessionId, { ...existing, status });
    }
    return updated;
  });
}

export function handleSessionEnded(
  message: Record<string, unknown>,
  setters: GatewayStateSetters,
  refs: GatewayRefs
): void {
  const sessionId = message.session_id as string;
  setters.setSessions((prev) => {
    const updated = new Map(prev);
    updated.delete(sessionId);
    return updated;
  });
  if (refs.attachedSessionRef.current === sessionId) {
    setters.setAttachedSession(null);
  }
}

export function handleEvent(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const sessionId = message.session_id as string;
  const seq = message.seq as number;
  const eventData = message.event as SessionEvent;

  const sequencedEvent: SequencedSessionEvent = {
    ...eventData,
    seq,
    sessionId,
  };

  setters.setSessionEvents((prev) => {
    const updated = new Map(prev);
    const existing = updated.get(sessionId) ?? [];
    // Insert in order by seq (events may arrive out of order during replay)
    const insertIndex = existing.findIndex((e) => e.seq > seq);
    if (insertIndex === -1) {
      updated.set(sessionId, [...existing, sequencedEvent]);
    } else {
      const newEvents = [...existing];
      newEvents.splice(insertIndex, 0, sequencedEvent);
      updated.set(sessionId, newEvents);
    }
    return updated;
  });
}

// ============================================================================
// Job Handlers
// ============================================================================

export function handleJobStarted(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  setters.setActiveJob({
    jobId: message.job_id as number,
    projectId: message.project_id as string | undefined,
    status: "running",
    events: [],
  });
}

export function handleJobStream(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const chunk = message.chunk as JobStreamChunk;
  setters.setActiveJob((prev) => {
    if (!prev) return null;
    return {
      ...prev,
      events: [...prev.events, chunk],
    };
  });
}

export function handleJobCompleted(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const ok = message.ok as boolean;
  setters.setActiveJob((prev) => {
    if (!prev) return null;
    return {
      ...prev,
      status: ok ? "completed" : "failed",
      result: ok ? (message.result as JobResult) : undefined,
      error: ok ? undefined : (message.error as string),
    };
  });
}

// ============================================================================
// Tracked Session Handlers (v5.2 - unified session store)
// ============================================================================

export function handleSessionsSnapshot(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const sessionsList = message.sessions as TrackedSession[];
  const sessionsMap = new Map<string, TrackedSession>();
  for (const session of sessionsList) {
    sessionsMap.set(session.sessionId, session);
  }
  setters.setTrackedSessions(sessionsMap);
  console.log("[GATEWAY] Sessions snapshot received:", sessionsList.length, "sessions");
}

export function handleSessionDiscovered(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const session = message.session as TrackedSession;
  setters.setTrackedSessions((prev) => {
    const updated = new Map(prev);
    updated.set(session.sessionId, session);
    return updated;
  });
  console.log("[GATEWAY] Session discovered:", session.sessionId);
}

export function handleSessionUpdated(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const sessionId = message.session_id as string;
  const updates = message.updates as Partial<TrackedSession>;
  setters.setTrackedSessions((prev) => {
    const updated = new Map(prev);
    const existing = updated.get(sessionId);
    if (existing) {
      updated.set(sessionId, { ...existing, ...updates });
    }
    return updated;
  });
}

export function handleSessionRemoved(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const sessionId = message.session_id as string;
  setters.setTrackedSessions((prev) => {
    const updated = new Map(prev);
    updated.delete(sessionId);
    return updated;
  });
  console.log("[GATEWAY] Session removed:", sessionId);
}

// ============================================================================
// Error Handler
// ============================================================================

export function handleError(
  message: Record<string, unknown>,
  setters: GatewayStateSetters
): void {
  const error = message.message as string;
  console.error("[GATEWAY] Error:", error);
  setters.setLastError(error);
}

// ============================================================================
// Message Handler Registry
// ============================================================================

const messageHandlers: Record<string, MessageHandler> = {
  "pong": () => { /* Heartbeat response - no action needed */ },
  "fleet.event": handleFleetEvent,
  "session.created": handleSessionCreated,
  "session.status": handleSessionStatus,
  "session.ended": handleSessionEnded,
  "event": handleEvent,
  "job.started": handleJobStarted,
  "job.stream": handleJobStream,
  "job.completed": handleJobCompleted,
  "error": handleError,
  "sessions.snapshot": handleSessionsSnapshot,
  "session.discovered": handleSessionDiscovered,
  "session.updated": handleSessionUpdated,
  "session.removed": handleSessionRemoved,
};

/**
 * Dispatch a gateway message to the appropriate handler.
 */
export function dispatchMessage(
  message: Record<string, unknown>,
  setters: GatewayStateSetters,
  refs: GatewayRefs
): void {
  const type = message.type as string;
  const handler = messageHandlers[type];

  if (handler) {
    handler(message, setters, refs);
  } else {
    console.log("[GATEWAY] Unknown message type:", type);
  }
}
