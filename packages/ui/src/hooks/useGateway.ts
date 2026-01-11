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
import { config } from "../config";
import { dispatchMessage, type GatewayStateSetters, type GatewayRefs } from "./gateway-handlers";

// Gateway config (from centralized config)
const GATEWAY_URL = config.gateway.wsUrl;
const RECONNECT_DELAY_MS = config.gateway.reconnectDelayMs;
const MAX_RECONNECT_ATTEMPTS = config.gateway.maxReconnectAttempts;

// ============================================================================
// Singleton Connection Manager (survives HMR and Strict Mode)
// ============================================================================

interface ConnectionManager {
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  subscribers: Set<(message: Record<string, unknown>) => void>;
  statusListeners: Set<(status: GatewayStatus) => void>;
  lastStatus: GatewayStatus;
}

// Global singleton that survives HMR
const connectionManager: ConnectionManager = (globalThis as unknown as { __gatewayManager?: ConnectionManager }).__gatewayManager ?? {
  ws: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  subscribers: new Set(),
  statusListeners: new Set(),
  lastStatus: "disconnected" as GatewayStatus,
};
(globalThis as unknown as { __gatewayManager: ConnectionManager }).__gatewayManager = connectionManager;

function notifyStatus(status: GatewayStatus) {
  connectionManager.lastStatus = status;
  connectionManager.statusListeners.forEach((listener) => listener(status));
}

function notifyMessage(message: Record<string, unknown>) {
  connectionManager.subscribers.forEach((subscriber) => subscriber(message));
}

function connectSingleton(fromEventId: number) {
  // Don't connect if already connected or connecting
  if (connectionManager.ws?.readyState === WebSocket.OPEN || connectionManager.ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  notifyStatus("connecting");
  console.log("[GATEWAY] Connecting to", GATEWAY_URL);

  const ws = new WebSocket(GATEWAY_URL);
  connectionManager.ws = ws;

  ws.onopen = () => {
    console.log("[GATEWAY] Connected");
    notifyStatus("connected");
    connectionManager.reconnectAttempts = 0;

    // Subscribe to fleet events
    ws.send(JSON.stringify({
      type: "fleet.subscribe",
      from_event_id: fromEventId,
    }));

    // Request session list (v5.2 - unified session store)
    ws.send(JSON.stringify({
      type: "sessions.list",
    }));
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      notifyMessage(message);
    } catch (err) {
      console.error("[GATEWAY] Failed to parse message:", err);
    }
  };

  ws.onerror = (error) => {
    console.error("[GATEWAY] WebSocket error:", error);
  };

  ws.onclose = (event) => {
    console.log("[GATEWAY] Disconnected:", event.code, event.reason);
    notifyStatus("disconnected");
    connectionManager.ws = null;

    // Only reconnect if there are subscribers
    if (connectionManager.subscribers.size === 0) {
      console.log("[GATEWAY] No subscribers, not reconnecting");
      return;
    }

    // Attempt reconnect
    if (connectionManager.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      connectionManager.reconnectAttempts++;
      const delay = RECONNECT_DELAY_MS * Math.min(connectionManager.reconnectAttempts, 5);
      console.log(`[GATEWAY] Reconnecting in ${delay}ms (attempt ${connectionManager.reconnectAttempts})`);
      connectionManager.reconnectTimer = setTimeout(() => connectSingleton(fromEventId), delay);
    } else {
      console.error("[GATEWAY] Failed to connect after multiple attempts");
    }
  };
}

function sendMessage(message: Record<string, unknown>) {
  if (connectionManager.ws?.readyState === WebSocket.OPEN) {
    connectionManager.ws.send(JSON.stringify(message));
  } else {
    console.warn("[GATEWAY] Cannot send - not connected");
  }
}

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

/**
 * Tracked session from gateway session store (v5.2).
 * Unified representation of sessions from both watcher and PTY sources.
 */
export interface TrackedSession {
  sessionId: string;
  projectId?: string;
  cwd: string;
  status: "working" | "waiting" | "idle";
  source: "watcher" | "pty";
  lastActivityAt: string;
  createdAt: string;
  gitBranch?: string | null;
  gitRepoUrl?: string | null;
  originalPrompt?: string | null;
  fileStatus?: {
    status: string;
    updated: string;
    task?: string;
    summary?: string;
    blockedOn?: string;
    error?: string;
    currentFile?: string;
    toolCount?: number;
    todos?: Array<{ content: string; status: string }>;
  } | null;
  pid?: number;
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
  // Sessions (legacy PTY sessions)
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
  // Tracked sessions (v5.2 - unified session store)
  trackedSessions: Map<string, TrackedSession>;
  requestSessionList: () => void;
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
  // Connection state (synced from singleton)
  const [status, setStatus] = useState<GatewayStatus>(connectionManager.lastStatus);
  const [lastError, setLastError] = useState<string | null>(null);

  // Fleet events
  const [fleetEvents, setFleetEvents] = useState<FleetEvent[]>([]);
  const [lastEventId, setLastEventId] = useState(0);
  const lastEventIdRef = useRef(0); // Ref for reconnection cursor

  // Sessions (legacy PTY sessions)
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [attachedSession, setAttachedSession] = useState<string | null>(null);
  const attachedSessionRef = useRef<string | null>(null); // Ref for message handler
  const [sessionEvents, setSessionEvents] = useState<Map<string, SequencedSessionEvent[]>>(new Map());

  // Tracked sessions (v5.2 - unified session store)
  const [trackedSessions, setTrackedSessions] = useState<Map<string, TrackedSession>>(new Map());

  // Jobs
  const [activeJob, setActiveJob] = useState<JobState | null>(null);

  // Keep ref in sync with state for message handler
  useEffect(() => {
    attachedSessionRef.current = attachedSession;
  }, [attachedSession]);

  // State setters for message handlers
  const stateSetters: GatewayStateSetters = useMemo(() => ({
    setFleetEvents,
    setLastEventId,
    setSessions,
    setAttachedSession,
    setSessionEvents,
    setTrackedSessions,
    setActiveJob,
    setLastError,
  }), []);

  // Refs for message handlers
  const gatewayRefs: GatewayRefs = useMemo(() => ({
    lastEventIdRef,
    attachedSessionRef,
  }), []);

  // Handle incoming messages (delegates to handler registry)
  const handleMessage = useCallback((message: Record<string, unknown>) => {
    dispatchMessage(message, stateSetters, gatewayRefs);
  }, [stateSetters, gatewayRefs]);

  // ============================================================================
  // Session Management (uses singleton sendMessage)
  // ============================================================================

  const createSession = useCallback((projectId: string, repoRoot: string) => {
    sendMessage({
      type: "session.create",
      project_id: projectId,
      repo_root: repoRoot,
    });
  }, []);

  const attachSession = useCallback((sessionId: string, fromSeq = 0) => {
    sendMessage({
      type: "session.attach",
      session_id: sessionId,
      from_seq: fromSeq,
    });
    setAttachedSession(sessionId);
  }, []);

  const detachSession = useCallback((sessionId: string) => {
    sendMessage({
      type: "session.detach",
      session_id: sessionId,
    });
    if (attachedSessionRef.current === sessionId) {
      setAttachedSession(null);
    }
  }, []);

  const sendStdin = useCallback((sessionId: string, data: string) => {
    sendMessage({
      type: "session.stdin",
      session_id: sessionId,
      data,
    });
  }, []);

  const sendSignal = useCallback((sessionId: string, signal: "SIGINT" | "SIGTERM" | "SIGKILL") => {
    sendMessage({
      type: "session.signal",
      session_id: sessionId,
      signal,
    });
  }, []);

  const resizeSession = useCallback((sessionId: string, cols: number, rows: number) => {
    sendMessage({
      type: "session.resize",
      session_id: sessionId,
      cols,
      rows,
    });
  }, []);

  const clearSessionEvents = useCallback((sessionId: string) => {
    setSessionEvents((prev) => {
      const updated = new Map(prev);
      updated.delete(sessionId);
      return updated;
    });
  }, []);

  const requestSessionList = useCallback(() => {
    sendMessage({ type: "sessions.list" });
  }, []);

  // ============================================================================
  // Job Management (uses singleton sendMessage)
  // ============================================================================

  const createJob = useCallback((request: JobCreateRequest) => {
    sendMessage({
      type: "job.create",
      job: request,
    });
  }, []);

  const cancelJob = useCallback(() => {
    // Use functional update pattern to get current activeJob
    setActiveJob((currentJob) => {
      if (currentJob) {
        sendMessage({
          type: "job.cancel",
          job_id: currentJob.jobId,
        });
      }
      return currentJob; // Don't modify state
    });
  }, []);

  // ============================================================================
  // Lifecycle - Subscribe to singleton connection manager
  // ============================================================================

  useEffect(() => {
    // Subscribe to status updates
    const statusListener = (newStatus: GatewayStatus) => {
      setStatus(newStatus);
      if (newStatus === "connected") {
        setLastError(null);
      }
    };
    connectionManager.statusListeners.add(statusListener);

    // Subscribe to messages
    connectionManager.subscribers.add(handleMessage);

    // Connect if not already connected (singleton handles deduplication)
    connectSingleton(lastEventIdRef.current);

    return () => {
      // Unsubscribe
      connectionManager.statusListeners.delete(statusListener);
      connectionManager.subscribers.delete(handleMessage);

      // Note: We don't close the connection here - the singleton stays alive
      // so other components or HMR reloads can reuse it
    };
  }, [handleMessage]);

  // Keep lastEventIdRef in sync with state
  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  // Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      if (connectionManager.ws?.readyState === WebSocket.OPEN) {
        connectionManager.ws.send(JSON.stringify({ type: "ping" }));
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
    trackedSessions,
    requestSessionList,
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
    trackedSessions,
    requestSessionList,
    activeJob,
    createJob,
    cancelJob,
    lastError,
  ]);
}
