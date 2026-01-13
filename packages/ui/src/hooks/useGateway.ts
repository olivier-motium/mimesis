/**
 * useGateway - Fleet Gateway WebSocket connection and state management.
 *
 * Provides:
 * - WebSocket connection to the gateway (via singleton connection manager)
 * - Session lifecycle management (create, attach, detach)
 * - Fleet event subscription
 * - Headless job management (Commander)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  connectGateway,
  sendGatewayMessage,
  subscribeToMessages,
  subscribeToStatus,
  getConnectionStatus,
  sendPing,
} from "./gateway-connection";
import { dispatchMessage, type GatewayStateSetters, type GatewayRefs } from "./gateway-handlers";

// Re-export types for consumers
export type {
  SessionState,
  TrackedSession,
  FleetEvent,
  SessionEvent,
  SequencedSessionEvent,
  JobState,
  JobStreamChunk,
  JobResult,
  JobCreateRequest,
  CommanderState,
  GatewayStatus,
} from "./gateway-types";

import type {
  SessionState,
  TrackedSession,
  FleetEvent,
  SequencedSessionEvent,
  JobState,
  JobCreateRequest,
  CommanderState,
  GatewayStatus,
} from "./gateway-types";

// ============================================================================
// Hook Result Interface
// ============================================================================

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
  // Commander (PTY-based conversation)
  commanderState: CommanderState;
  commanderEvents: SequencedSessionEvent[];
  commanderContentEvents: SequencedSessionEvent[];
  sendCommanderPrompt: (prompt: string) => void;
  resetCommander: () => void;
  cancelCommander: () => void;
  clearCommanderEvents: () => void;
  clearCommanderContentEvents: () => void;
  // Errors
  lastError: string | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGateway(): UseGatewayResult {
  // Connection state (synced from singleton)
  const [status, setStatus] = useState<GatewayStatus>(getConnectionStatus());
  const [lastError, setLastError] = useState<string | null>(null);

  // Fleet events
  const [fleetEvents, setFleetEvents] = useState<FleetEvent[]>([]);
  const [lastEventId, setLastEventId] = useState(0);
  const lastEventIdRef = useRef(0); // Ref for reconnection cursor

  // Sessions (legacy PTY sessions)
  const [sessions, setSessions] = useState(new Map<string, SessionState>());
  const [attachedSession, setAttachedSession] = useState<string | null>(null);
  const attachedSessionRef = useRef<string | null>(null); // Ref for message handler
  const [sessionEvents, setSessionEvents] = useState(new Map<string, SequencedSessionEvent[]>());

  // Tracked sessions (v5.2 - unified session store)
  const [trackedSessions, setTrackedSessions] = useState(new Map<string, TrackedSession>());

  // Jobs
  const [activeJob, setActiveJob] = useState<JobState | null>(null);

  // Commander state (PTY-based)
  const [commanderState, setCommanderState] = useState<CommanderState>({
    status: "idle",
    ptySessionId: null,
    claudeSessionId: null,
    queuedPrompts: 0,
    isFirstTurn: true,
  });

  // Commander events (streamed PTY output)
  const [commanderEvents, setCommanderEvents] = useState<SequencedSessionEvent[]>([]);

  // Commander content events (structured content from JSONL parsing)
  const [commanderContentEvents, setCommanderContentEvents] = useState<SequencedSessionEvent[]>([]);

  // Keep ref in sync with state for message handler
  useEffect(() => {
    attachedSessionRef.current = attachedSession;
  }, [attachedSession]);

  // State setters for message handlers (setState functions are stable)
  const stateSetters: GatewayStateSetters = {
    setFleetEvents,
    setLastEventId,
    setSessions,
    setAttachedSession,
    setSessionEvents,
    setTrackedSessions,
    setActiveJob,
    setLastError,
    setCommanderState,
    setCommanderEvents,
    setCommanderContentEvents,
  };

  // Refs for message handlers (refs are stable)
  const gatewayRefs: GatewayRefs = {
    lastEventIdRef,
    attachedSessionRef,
  };

  // Handle incoming messages (delegates to handler registry)
  const handleMessage = useCallback((message: Record<string, unknown>) => {
    dispatchMessage(message, stateSetters, gatewayRefs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // Session Management Actions
  // ============================================================================

  const createSession = useCallback((projectId: string, repoRoot: string) => {
    sendGatewayMessage({
      type: "session.create",
      project_id: projectId,
      repo_root: repoRoot,
    });
  }, []);

  const attachSession = useCallback((sessionId: string, fromSeq = 0) => {
    sendGatewayMessage({
      type: "session.attach",
      session_id: sessionId,
      from_seq: fromSeq,
    });
    setAttachedSession(sessionId);
  }, []);

  const detachSession = useCallback((sessionId: string) => {
    sendGatewayMessage({
      type: "session.detach",
      session_id: sessionId,
    });
    if (attachedSessionRef.current === sessionId) {
      setAttachedSession(null);
    }
  }, []);

  const sendStdin = useCallback((sessionId: string, data: string) => {
    sendGatewayMessage({
      type: "session.stdin",
      session_id: sessionId,
      data,
    });
  }, []);

  const sendSignal = useCallback((sessionId: string, signal: "SIGINT" | "SIGTERM" | "SIGKILL") => {
    sendGatewayMessage({
      type: "session.signal",
      session_id: sessionId,
      signal,
    });
  }, []);

  const resizeSession = useCallback((sessionId: string, cols: number, rows: number) => {
    sendGatewayMessage({
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
    sendGatewayMessage({ type: "sessions.list" });
  }, []);

  // ============================================================================
  // Job Management Actions
  // ============================================================================

  const createJob = useCallback((request: JobCreateRequest) => {
    sendGatewayMessage({
      type: "job.create",
      job: request,
    });
  }, []);

  const cancelJob = useCallback(() => {
    // Use functional update pattern to get current activeJob
    setActiveJob((currentJob) => {
      if (currentJob) {
        sendGatewayMessage({
          type: "job.cancel",
          job_id: currentJob.jobId,
        });
      }
      return currentJob; // Don't modify state
    });
  }, []);

  // ============================================================================
  // Commander Management Actions
  // ============================================================================

  const sendCommanderPrompt = useCallback((prompt: string) => {
    sendGatewayMessage({
      type: "commander.send",
      prompt,
    });
  }, []);

  const resetCommander = useCallback(() => {
    sendGatewayMessage({
      type: "commander.reset",
    });
    // Clear events when resetting the conversation
    setCommanderEvents([]);
    setCommanderContentEvents([]);
  }, []);

  const clearCommanderEvents = useCallback(() => {
    setCommanderEvents([]);
  }, []);

  const clearCommanderContentEvents = useCallback(() => {
    setCommanderContentEvents([]);
  }, []);

  const cancelCommander = useCallback(() => {
    sendGatewayMessage({
      type: "commander.cancel",
    });
  }, []);

  // ============================================================================
  // Lifecycle - Subscribe to singleton connection manager
  // ============================================================================

  useEffect(() => {
    // Subscribe to status updates
    const unsubscribeStatus = subscribeToStatus((newStatus) => {
      setStatus(newStatus);
      if (newStatus === "connected") {
        setLastError(null);
      }
    });

    // Subscribe to messages
    const unsubscribeMessages = subscribeToMessages(handleMessage);

    // Connect if not already connected (singleton handles deduplication)
    connectGateway(lastEventIdRef.current);

    return () => {
      unsubscribeStatus();
      unsubscribeMessages();
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
      sendPing();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
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
    commanderState,
    commanderEvents,
    commanderContentEvents,
    sendCommanderPrompt,
    resetCommander,
    cancelCommander,
    clearCommanderEvents,
    clearCommanderContentEvents,
    lastError,
  };
}
