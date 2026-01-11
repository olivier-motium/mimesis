/**
 * Watcher Session Handlers - Handle external Claude Code session events.
 *
 * Extracted from gateway-server.ts to reduce file size and improve modularity.
 */

import type { WebSocket } from "ws";
import type { SessionStore, TrackedSession } from "../session-store.js";
import type { StatusWatcher, StatusUpdateEvent } from "../../status-watcher.js";
import type { SessionEvent as WatcherSessionEvent } from "../../watcher.js";
import type { GatewayMessage } from "../protocol.js";
import type { ClientState } from "./pty-session-handlers.js";
import { convertEntriesToEvents } from "../entry-converter.js";

/**
 * Dependencies for watcher handlers.
 */
export interface WatcherHandlerDependencies {
  sessionStore: SessionStore;
  statusWatcher?: StatusWatcher;
  clients: Map<WebSocket, ClientState>;
  send: (ws: WebSocket, message: GatewayMessage) => void;
}

/**
 * Handle session watcher events (external Claude Code sessions).
 */
export function handleWatcherSession(
  deps: WatcherHandlerDependencies,
  event: WatcherSessionEvent
): void {
  const { sessionStore, statusWatcher } = deps;
  const { type, session } = event;

  switch (type) {
    case "created":
    case "updated":
      sessionStore.addFromWatcher({
        sessionId: session.sessionId,
        cwd: session.cwd,
        status: session.status,
        gitBranch: session.gitBranch,
        gitRepoUrl: session.gitRepoUrl,
        originalPrompt: session.originalPrompt,
        startedAt: session.startedAt,
        entries: session.entries,
      });

      // Start watching status files for this project
      if (statusWatcher) {
        statusWatcher.watchProject(session.cwd);
      }
      break;

    case "deleted":
      sessionStore.remove(session.sessionId);
      break;
  }
}

/**
 * Handle status watcher events (file-based status updates).
 */
export function handleStatusUpdate(
  deps: WatcherHandlerDependencies,
  event: StatusUpdateEvent
): void {
  const { sessionStore } = deps;
  const { sessionId, status } = event;
  sessionStore.updateFileStatus(sessionId, status);
}

/**
 * Handle sessions.list message - return full session snapshot.
 */
export function handleSessionsList(
  deps: WatcherHandlerDependencies,
  ws: WebSocket
): void {
  const { sessionStore, send } = deps;
  const sessions = sessionStore.getAll();
  send(ws, {
    type: "sessions.snapshot",
    sessions,
  });
}

/**
 * Handle watcher session attach (read-only mode).
 * Returns events for display in Timeline when no PTY session exists.
 */
export function handleWatcherSessionAttach(
  deps: WatcherHandlerDependencies,
  ws: WebSocket,
  state: ClientState,
  trackedSession: TrackedSession
): void {
  const { send } = deps;
  const sessionId = trackedSession.sessionId;

  // Limited attach for watcher sessions - status only, no stdin/signals
  state.attachedSession = sessionId;

  // Send session status
  send(ws, {
    type: "session.status",
    session_id: sessionId,
    status: trackedSession.status,
  });

  // Send full conversation history if entries are available
  if (trackedSession.entries && trackedSession.entries.length > 0) {
    const { events } = convertEntriesToEvents(trackedSession.entries);
    let seq = 0;
    for (const event of events) {
      send(ws, {
        type: "event",
        session_id: sessionId,
        seq: seq++,
        event,
      });
    }
    return;
  }

  // Fallback: Send session metadata as events (no conversation entries)
  const now = new Date().toISOString();
  let seq = 0;

  // Header: External session indicator
  send(ws, {
    type: "event",
    session_id: sessionId,
    seq: seq++,
    event: {
      type: "text",
      data: `📡 Monitoring external session${trackedSession.gitBranch ? ` on ${trackedSession.gitBranch}` : ""}`,
      timestamp: now,
    },
  });

  // Show task/goal if available from status file
  if (trackedSession.fileStatus?.task) {
    send(ws, {
      type: "event",
      session_id: sessionId,
      seq: seq++,
      event: {
        type: "text",
        data: `📋 Task: ${trackedSession.fileStatus.task}`,
        timestamp: now,
      },
    });
  } else if (trackedSession.originalPrompt) {
    // Fallback to original prompt
    const truncated = trackedSession.originalPrompt.length > 200
      ? trackedSession.originalPrompt.slice(0, 200) + "..."
      : trackedSession.originalPrompt;
    send(ws, {
      type: "event",
      session_id: sessionId,
      seq: seq++,
      event: {
        type: "text",
        data: `📋 Prompt: ${truncated}`,
        timestamp: now,
      },
    });
  }

  // Status indicator
  const statusEmoji = trackedSession.status === "working" ? "🟢"
    : trackedSession.status === "waiting" ? "🟡"
    : "⚪";
  send(ws, {
    type: "event",
    session_id: sessionId,
    seq: seq++,
    event: {
      type: "text",
      data: `${statusEmoji} Status: ${trackedSession.status.charAt(0).toUpperCase() + trackedSession.status.slice(1)}`,
      timestamp: now,
    },
  });
}
