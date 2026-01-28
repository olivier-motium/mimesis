/**
 * PTY Session Handlers - Handle PTY session lifecycle and I/O.
 *
 * Extracted from gateway-server.ts to reduce file size and improve modularity.
 */

import type { WebSocket } from "ws";
import type { PtyBridge } from "../pty-bridge.js";
import type { SessionStore } from "../session-store.js";
import type { EventMergerManager } from "../event-merger.js";
import type { RingBufferManager } from "../ring-buffer.js";
import type { StatusWatcher } from "../../status-watcher.js";
import type { GatewayMessage, SessionEvent } from "../protocol.js";
import type { SubscriptionManager } from "../subscription-manager.js";

/**
 * Client state for session tracking.
 */
export interface ClientState {
  ws: WebSocket;
  attachedSession: string | null;
  fleetSubscribed: boolean;
  fleetCursor: number;
  /** Unsubscribe from Commander events (set on connection) */
  commanderUnsubscribe?: () => void;
}

/**
 * Dependencies for PTY session handlers.
 */
export interface PtyHandlerDependencies {
  ptyBridge: PtyBridge;
  sessionStore: SessionStore;
  mergerManager: EventMergerManager;
  bufferManager: RingBufferManager;
  statusWatcher?: StatusWatcher;
  clients: Map<WebSocket, ClientState>;
  subscriptionManager: SubscriptionManager;
  send: (ws: WebSocket, message: GatewayMessage) => void;
  /** Get Commander's PTY session ID (for routing Commander output to all clients) */
  getCommanderPtySessionId?: () => string | null;
  /** Notify CommanderSessionManager when its PTY exits */
  onCommanderPtyExit?: (exitCode: number, signal?: string) => void;
}

/**
 * Handle session.create message.
 */
export async function handleSessionCreate(
  deps: PtyHandlerDependencies,
  ws: WebSocket,
  state: ClientState,
  message: { project_id: string; repo_root: string; command?: string[]; cols?: number; rows?: number }
): Promise<void> {
  const { ptyBridge, sessionStore, statusWatcher, send } = deps;

  try {
    const session = await ptyBridge.create({
      projectId: message.project_id,
      cwd: message.repo_root,
      command: message.command,
      cols: message.cols,
      rows: message.rows,
    });

    // Add to session store (PTY-created session)
    sessionStore.addFromPty({
      sessionId: session.sessionId,
      projectId: session.projectId,
      cwd: message.repo_root,
      pid: session.pid,
    });

    // Start watching status files for this project
    if (statusWatcher) {
      statusWatcher.watchProject(message.repo_root);
    }

    // Auto-attach to the new session
    state.attachedSession = session.sessionId;

    send(ws, {
      type: "session.created",
      session_id: session.sessionId,
      project_id: session.projectId,
      pid: session.pid,
    });
  } catch (error) {
    send(ws, {
      type: "error",
      code: "SESSION_CREATE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Handle session.stdin message.
 * Only PTY sessions support stdin - watcher sessions are read-only.
 */
export function handleSessionStdin(
  deps: PtyHandlerDependencies,
  state: ClientState,
  message: { session_id: string; data: string }
): void {
  const { ptyBridge } = deps;

  if (state.attachedSession !== message.session_id) return;

  // Only PTY sessions support stdin
  const ptySession = ptyBridge.getSession(message.session_id);
  if (!ptySession) {
    // Silently ignore - watcher sessions don't have stdin
    return;
  }

  ptyBridge.write(message.session_id, message.data);
}

/**
 * Handle session.signal message.
 * Only PTY sessions support signals - watcher sessions are read-only.
 */
export function handleSessionSignal(
  deps: PtyHandlerDependencies,
  state: ClientState,
  message: { session_id: string; signal: "SIGINT" | "SIGTERM" | "SIGKILL" }
): void {
  const { ptyBridge } = deps;

  if (state.attachedSession !== message.session_id) return;

  // Only PTY sessions support signals
  const ptySession = ptyBridge.getSession(message.session_id);
  if (!ptySession) {
    // Silently ignore - watcher sessions don't have signals
    return;
  }

  ptyBridge.signal(message.session_id, message.signal);
}

/**
 * Handle session.resize message.
 */
export function handleSessionResize(
  deps: PtyHandlerDependencies,
  state: ClientState,
  message: { session_id: string; cols: number; rows: number }
): void {
  const { ptyBridge } = deps;

  if (state.attachedSession === message.session_id) {
    ptyBridge.resize(message.session_id, message.cols, message.rows);
  }
}

/**
 * Handle PTY output event.
 */
export function handlePtyOutput(
  deps: PtyHandlerDependencies,
  sessionId: string,
  event: SessionEvent
): void {
  const { mergerManager, send, getCommanderPtySessionId } = deps;

  const merger = mergerManager.getOrCreate(sessionId);
  const data = (event as { data: string }).data;
  const seq = merger.addStdout(data);

  // Check if this is Commander output
  const commanderPtyId = getCommanderPtySessionId?.();
  const isCommanderOutput = commanderPtyId === sessionId;

  // Debug: Log Commander output
  if (isCommanderOutput) {
    console.log(`[COMMANDER PTY] Received ${data.length} chars of stdout (seq=${seq})`);
  }

  // Broadcast to clients using subscription manager routing
  const category = isCommanderOutput ? "commander" as const : "session" as const;
  const messageType = isCommanderOutput ? "commander.stdout" : "event";
  const recipients = deps.subscriptionManager.getRecipients(category, sessionId);
  for (const ws of recipients) {
    send(ws, { type: messageType, session_id: sessionId, seq, event } as any);
  }
}

/**
 * Handle PTY exit event.
 */
export function handlePtyExit(
  deps: PtyHandlerDependencies,
  sessionId: string,
  code: number,
  signal?: string
): void {
  const { mergerManager, bufferManager, clients, send, getCommanderPtySessionId, onCommanderPtyExit } = deps;

  // Check if this is Commander's PTY exiting
  const commanderSessionId = getCommanderPtySessionId?.();
  if (commanderSessionId === sessionId && onCommanderPtyExit) {
    onCommanderPtyExit(code, signal);
  }

  // Notify subscribed clients
  const recipients = deps.subscriptionManager.getRecipients("session", sessionId);
  for (const ws of recipients) {
    send(ws, { type: "session.ended", session_id: sessionId, exit_code: code, signal } as any);
  }
  // Clear attachment state
  for (const [ws, state] of clients) {
    if (state.attachedSession === sessionId) {
      state.attachedSession = null;
    }
  }

  // Clean up merger and buffer
  mergerManager.remove(sessionId);
  bufferManager.remove(sessionId);
}
