/**
 * useGateway - Fleet Gateway WebSocket connection and state management.
 *
 * Provides:
 * - WebSocket connection to the gateway
 * - Session lifecycle management (create, attach, detach)
 * - Fleet event subscription
 * - Headless job management (Commander)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// Gateway config
const GATEWAY_URL = "ws://127.0.0.1:4452";
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ============================================================================
// Types (mirrored from daemon/gateway/protocol.ts)
// ============================================================================

export interface SessionState {
  sessionId: string;
  projectId: string;
  pid: number;
  status: "working" | "waiting" | "idle";
  attachedClients: number;
}

export interface FleetEvent {
  eventId: number;
  ts: string;
  type: string;
  projectId?: string;
  briefingId?: number;
  data: unknown;
}

export interface SessionEvent {
  type: "stdout" | "tool" | "text" | "thinking" | "progress" | "status_change";
  timestamp: string;
  // stdout
  data?: string;
  // tool
  phase?: "pre" | "post";
  tool_name?: string;
  tool_input?: unknown;
  tool_result?: unknown;
  ok?: boolean;
  // text
  text?: string;
  // thinking
  thinking?: string;
  // status_change
  status?: "working" | "waiting" | "idle";
}

export interface JobState {
  jobId: number;
  projectId?: string;
  status: "running" | "completed" | "failed";
  events: JobStreamChunk[];
  result?: JobResult;
  error?: string;
}

export interface JobStreamChunk {
  type: string;
  // Various stream-json fields
  [key: string]: unknown;
}

export interface JobResult {
  text?: string;
  thinking?: string;
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
}

export type GatewayStatus = "connecting" | "connected" | "disconnected";

// ============================================================================
// Hook
// ============================================================================

/** Session event with sequence number for ordering */
export interface SequencedSessionEvent extends SessionEvent {
  seq: number;
  sessionId: string;
}

export interface UseGatewayResult {
  status: GatewayStatus;
  // Fleet events
  fleetEvents: FleetEvent[];
  lastEventId: number;
  // Sessions
  sessions: Map<string, SessionState>;
  attachedSession: string | null;
  sessionEvents: Map<string, SequencedSessionEvent[]>;
  attachSession: (sessionId: string, fromSeq?: number) => void;
  detachSession: (sessionId: string) => void;
  createSession: (projectId: string, repoRoot: string) => void;
  sendStdin: (sessionId: string, data: string) => void;
  sendSignal: (sessionId: string, signal: "SIGINT" | "SIGTERM" | "SIGKILL") => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
  clearSessionEvents: (sessionId: string) => void;
  // Jobs
  activeJob: JobState | null;
  createJob: (request: JobCreateRequest) => void;
  cancelJob: () => void;
  // Errors
  lastError: string | null;
}

export interface JobCreateRequest {
  type: string;
  projectId?: string;
  repoRoot?: string;
  model: "opus" | "sonnet" | "haiku";
  request: {
    prompt: string;
    systemPrompt?: string;
    maxTurns?: number;
    disallowedTools?: string[];
  };
}

export function useGateway(): UseGatewayResult {
  // Connection state
  const [status, setStatus] = useState<GatewayStatus>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  // Fleet events
  const [fleetEvents, setFleetEvents] = useState<FleetEvent[]>([]);
  const [lastEventId, setLastEventId] = useState(0);

  // Sessions
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [attachedSession, setAttachedSession] = useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = useState<Map<string, SequencedSessionEvent[]>>(new Map());

  // Jobs
  const [activeJob, setActiveJob] = useState<JobState | null>(null);

  // ============================================================================
  // WebSocket Connection
  // ============================================================================

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus("connecting");
    console.log("[GATEWAY] Connecting to", GATEWAY_URL);

    const ws = new WebSocket(GATEWAY_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[GATEWAY] Connected");
      setStatus("connected");
      setLastError(null);
      reconnectAttempts.current = 0;

      // Subscribe to fleet events from cursor 0
      ws.send(JSON.stringify({
        type: "fleet.subscribe",
        from_event_id: lastEventId,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error("[GATEWAY] Failed to parse message:", err);
      }
    };

    ws.onerror = (error) => {
      console.error("[GATEWAY] WebSocket error:", error);
    };

    ws.onclose = (event) => {
      console.log("[GATEWAY] Disconnected:", event.code, event.reason);
      setStatus("disconnected");
      wsRef.current = null;

      // Attempt reconnect
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++;
        const delay = RECONNECT_DELAY_MS * Math.min(reconnectAttempts.current, 5);
        console.log(`[GATEWAY] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
        reconnectTimer.current = setTimeout(connect, delay);
      } else {
        setLastError("Failed to connect to gateway after multiple attempts");
      }
    };
  }, [lastEventId]);

  // Handle incoming messages
  const handleMessage = useCallback((message: Record<string, unknown>) => {
    const type = message.type as string;

    switch (type) {
      case "pong":
        // Heartbeat response
        break;

      case "fleet.event": {
        const event: FleetEvent = {
          eventId: message.event_id as number,
          ts: message.ts as string,
          type: (message.event as Record<string, unknown>).type as string,
          projectId: (message.event as Record<string, unknown>).project_id as string | undefined,
          briefingId: (message.event as Record<string, unknown>).briefing_id as number | undefined,
          data: (message.event as Record<string, unknown>).data,
        };
        setFleetEvents((prev) => [...prev, event]);
        setLastEventId(event.eventId);
        break;
      }

      case "session.created": {
        const session: SessionState = {
          sessionId: message.session_id as string,
          projectId: message.project_id as string,
          pid: message.pid as number,
          status: "idle",
          attachedClients: 1,
        };
        setSessions((prev) => new Map(prev).set(session.sessionId, session));
        setAttachedSession(session.sessionId);
        break;
      }

      case "session.status": {
        const sessionId = message.session_id as string;
        const status = message.status as "working" | "waiting" | "idle";
        setSessions((prev) => {
          const updated = new Map(prev);
          const existing = updated.get(sessionId);
          if (existing) {
            updated.set(sessionId, { ...existing, status });
          }
          return updated;
        });
        break;
      }

      case "session.ended": {
        const sessionId = message.session_id as string;
        setSessions((prev) => {
          const updated = new Map(prev);
          updated.delete(sessionId);
          return updated;
        });
        if (attachedSession === sessionId) {
          setAttachedSession(null);
        }
        break;
      }

      case "event": {
        // Session event from PTY or hooks - store for Timeline rendering
        const sessionId = message.session_id as string;
        const seq = message.seq as number;
        const eventData = message.event as SessionEvent;

        const sequencedEvent: SequencedSessionEvent = {
          ...eventData,
          seq,
          sessionId,
        };

        setSessionEvents((prev) => {
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
        break;
      }

      case "job.started": {
        setActiveJob({
          jobId: message.job_id as number,
          projectId: message.project_id as string | undefined,
          status: "running",
          events: [],
        });
        break;
      }

      case "job.stream": {
        const chunk = message.chunk as JobStreamChunk;
        setActiveJob((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            events: [...prev.events, chunk],
          };
        });
        break;
      }

      case "job.completed": {
        const ok = message.ok as boolean;
        setActiveJob((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: ok ? "completed" : "failed",
            result: ok ? (message.result as JobResult) : undefined,
            error: ok ? undefined : (message.error as string),
          };
        });
        break;
      }

      case "error": {
        const error = message.message as string;
        console.error("[GATEWAY] Error:", error);
        setLastError(error);
        break;
      }

      default:
        console.log("[GATEWAY] Unknown message type:", type);
    }
  }, [attachedSession]);

  // ============================================================================
  // Session Management
  // ============================================================================

  const send = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("[GATEWAY] Cannot send - not connected");
    }
  }, []);

  const createSession = useCallback((projectId: string, repoRoot: string) => {
    send({
      type: "session.create",
      project_id: projectId,
      repo_root: repoRoot,
    });
  }, [send]);

  const attachSession = useCallback((sessionId: string, fromSeq = 0) => {
    send({
      type: "session.attach",
      session_id: sessionId,
      from_seq: fromSeq,
    });
    setAttachedSession(sessionId);
  }, [send]);

  const detachSession = useCallback((sessionId: string) => {
    send({
      type: "session.detach",
      session_id: sessionId,
    });
    if (attachedSession === sessionId) {
      setAttachedSession(null);
    }
  }, [send, attachedSession]);

  const sendStdin = useCallback((sessionId: string, data: string) => {
    send({
      type: "session.stdin",
      session_id: sessionId,
      data,
    });
  }, [send]);

  const sendSignal = useCallback((sessionId: string, signal: "SIGINT" | "SIGTERM" | "SIGKILL") => {
    send({
      type: "session.signal",
      session_id: sessionId,
      signal,
    });
  }, [send]);

  const resizeSession = useCallback((sessionId: string, cols: number, rows: number) => {
    send({
      type: "session.resize",
      session_id: sessionId,
      cols,
      rows,
    });
  }, [send]);

  const clearSessionEvents = useCallback((sessionId: string) => {
    setSessionEvents((prev) => {
      const updated = new Map(prev);
      updated.delete(sessionId);
      return updated;
    });
  }, []);

  // ============================================================================
  // Job Management
  // ============================================================================

  const createJob = useCallback((request: JobCreateRequest) => {
    send({
      type: "job.create",
      job: request,
    });
  }, [send]);

  const cancelJob = useCallback(() => {
    if (activeJob) {
      send({
        type: "job.cancel",
        job_id: activeJob.jobId,
      });
    }
  }, [send, activeJob]);

  // ============================================================================
  // Lifecycle
  // ============================================================================

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return useMemo(() => ({
    status,
    fleetEvents,
    lastEventId,
    sessions,
    attachedSession,
    sessionEvents,
    attachSession,
    detachSession,
    createSession,
    sendStdin,
    sendSignal,
    resizeSession,
    clearSessionEvents,
    activeJob,
    createJob,
    cancelJob,
    lastError,
  }), [
    status,
    fleetEvents,
    lastEventId,
    sessions,
    attachedSession,
    sessionEvents,
    attachSession,
    detachSession,
    createSession,
    sendStdin,
    sendSignal,
    resizeSession,
    clearSessionEvents,
    activeJob,
    createJob,
    cancelJob,
    lastError,
  ]);
}
