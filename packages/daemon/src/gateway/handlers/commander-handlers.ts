/**
 * Commander Handlers - Handle PTY-based Commander conversation.
 *
 * Commander is a persistent Opus PTY session with automatic fleet context injection.
 * Features:
 * - Prompt queue (no BUSY errors)
 * - Native conversation state (no --continue needed)
 * - All hooks fire naturally
 * - Session persistence via captured session ID
 */

import type { WebSocket } from "ws";
import type { GatewayMessage } from "../protocol.js";
import type {
  CommanderSessionManager,
  CommanderEvent,
} from "../commander-session.js";
import { getTracer, recordError } from "../../telemetry/spans.js";

/**
 * Dependencies for commander handlers.
 */
export interface CommanderHandlerDependencies {
  commanderSession: CommanderSessionManager;
  send: (ws: WebSocket, message: GatewayMessage) => void;
}

/**
 * Handle commander.send message.
 *
 * Sends prompt to Commander (queues if busy).
 */
export async function handleCommanderSend(
  deps: CommanderHandlerDependencies,
  ws: WebSocket,
  message: { prompt: string }
): Promise<void> {
  const tracer = getTracer();
  const span = tracer.startSpan("gateway.commander.send", {
    attributes: {
      "gateway.prompt_length": message.prompt.length,
    },
  });

  const { commanderSession, send } = deps;

  try {
    await commanderSession.sendPrompt(message.prompt);

    // Send current state to client
    send(ws, {
      type: "commander.state",
      state: commanderSession.getState(),
    });
  } catch (error) {
    recordError(span, error as Error);
    send(ws, {
      type: "error",
      code: "COMMANDER_SEND_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    span.end();
  }
}

/**
 * Handle commander.reset message.
 *
 * Resets the Commander conversation to start fresh.
 */
export async function handleCommanderReset(
  deps: CommanderHandlerDependencies,
  ws: WebSocket
): Promise<void> {
  const tracer = getTracer();
  const span = tracer.startSpan("gateway.commander.reset");

  const { commanderSession, send } = deps;

  try {
    await commanderSession.reset();

    // Send updated state
    send(ws, {
      type: "commander.state",
      state: commanderSession.getState(),
    });
  } catch (error) {
    recordError(span, error as Error);
    send(ws, {
      type: "error",
      code: "COMMANDER_RESET_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    span.end();
  }
}

/**
 * Handle commander.cancel message.
 *
 * Cancels current Commander operation (SIGINT).
 */
export async function handleCommanderCancel(
  deps: CommanderHandlerDependencies,
  ws: WebSocket
): Promise<void> {
  const tracer = getTracer();
  const span = tracer.startSpan("gateway.commander.cancel");

  const { commanderSession, send } = deps;

  try {
    await commanderSession.cancel();

    // State will be updated via status detection
  } catch (error) {
    recordError(span, error as Error);
    send(ws, {
      type: "error",
      code: "COMMANDER_CANCEL_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    span.end();
  }
}

/**
 * Setup Commander event forwarding to a WebSocket client.
 *
 * Called when a client connects to forward Commander events.
 */
export function setupCommanderEventForwarding(
  commanderSession: CommanderSessionManager,
  ws: WebSocket,
  send: (ws: WebSocket, message: GatewayMessage) => void
): () => void {
  const listener = (event: CommanderEvent) => {
    // Forward Commander events to client
    switch (event.type) {
      case "commander.state":
        send(ws, {
          type: "commander.state",
          state: event.state,
        });
        break;

      case "commander.queued":
        send(ws, {
          type: "commander.queued",
          position: event.position,
          prompt: event.prompt,
        });
        break;

      case "commander.ready":
        send(ws, {
          type: "commander.ready",
        });
        break;
    }
  };

  commanderSession.on("commander", listener);

  // Return unsubscribe function
  return () => {
    commanderSession.off("commander", listener);
  };
}
