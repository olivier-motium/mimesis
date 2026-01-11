/**
 * Hook Event Handlers - Handle hook IPC events from Unix socket.
 *
 * Extracted from gateway-server.ts to reduce file size and improve modularity.
 */

import type { WebSocket } from "ws";
import type { EventMergerManager } from "../event-merger.js";
import { parseHookEvent, type HookEvent, type SessionEvent, type GatewayMessage } from "../protocol.js";
import type { ClientState } from "./pty-session-handlers.js";

/**
 * Dependencies for hook handlers.
 */
export interface HookHandlerDependencies {
  mergerManager: EventMergerManager;
  clients: Map<WebSocket, ClientState>;
  send: (ws: WebSocket, message: GatewayMessage) => void;
}

/**
 * Handle hook event from Unix socket.
 */
export function handleHookEvent(
  deps: HookHandlerDependencies,
  line: string
): void {
  const { mergerManager, clients, send } = deps;

  const hookEvent = parseHookEvent(line);
  if (!hookEvent) return;

  const sessionId = hookEvent.fleet_session_id;
  const merger = mergerManager.get(sessionId);
  if (!merger) return;

  const seq = merger.addHookEvent(hookEvent);
  if (seq < 0) return;

  // Create session event from hook
  const event = hookToSessionEvent(hookEvent);
  if (!event) return;

  // Broadcast to attached clients
  for (const [ws, state] of clients) {
    if (state.attachedSession === sessionId) {
      send(ws, {
        type: "event",
        session_id: sessionId,
        seq,
        event,
      });
    }
  }
}

/**
 * Convert hook event to session event.
 */
export function hookToSessionEvent(hook: HookEvent): SessionEvent | null {
  const timestamp = hook.timestamp ?? new Date().toISOString();

  if (hook.tool_name) {
    return {
      type: "tool",
      phase: hook.phase ?? "post",
      tool_name: hook.tool_name,
      tool_input: hook.tool_input,
      tool_result: hook.tool_result,
      ok: hook.ok ?? true,
      timestamp,
    };
  }

  return null;
}
