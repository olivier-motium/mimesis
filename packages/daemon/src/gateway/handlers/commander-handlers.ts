/**
 * Commander Handlers - Handle stateful Commander conversation.
 *
 * Commander uses persistent Opus conversations with automatic fleet context injection.
 * Conversation state is managed by the gateway, not the client.
 */

import type { WebSocket } from "ws";
import type { JobManager, JobEventListener } from "../job-manager.js";
import type { GatewayMessage } from "../protocol.js";
import { ConversationRepo, CONVERSATION_KIND } from "../../fleet-db/conversation-repo.js";
import { FleetPreludeBuilder } from "../fleet-prelude-builder.js";
import { JOB_TYPE, MODEL, COMMANDER_CWD } from "../../config/fleet.js";

/**
 * Dependencies for commander handlers.
 */
export interface CommanderHandlerDependencies {
  jobManager: JobManager;
  send: (ws: WebSocket, message: GatewayMessage) => void;
}

/**
 * Singleton state for Commander conversation.
 * Ensures only one Commander turn runs at a time.
 */
let commanderTurnInProgress = false;

/**
 * Handle commander.send message.
 *
 * This is the main entry point for Commander prompts.
 * The handler:
 * 1. Gets or creates the Commander conversation
 * 2. Builds fleet prelude from outbox events
 * 3. Creates a job with conversation binding
 * 4. Updates conversation cursor after completion
 */
export async function handleCommanderSend(
  deps: CommanderHandlerDependencies,
  ws: WebSocket,
  message: { prompt: string }
): Promise<void> {
  const { jobManager, send } = deps;

  // Serialize Commander turns
  if (commanderTurnInProgress) {
    send(ws, {
      type: "error",
      code: "COMMANDER_BUSY",
      message: "Commander is already processing a turn. Please wait.",
    });
    return;
  }

  commanderTurnInProgress = true;

  try {
    const conversationRepo = new ConversationRepo();
    const preludeBuilder = new FleetPreludeBuilder();

    // Get or create Commander conversation
    const conversation = conversationRepo.getOrCreateCommander();

    // Build fleet prelude
    const prelude = preludeBuilder.build({
      lastEventIdSeen: conversation.lastOutboxEventIdSeen ?? 0,
      maxEvents: 20,
      includeDocDriftWarnings: true,
    });

    // Prepare prompt with fleet delta
    const fullPrompt = prelude.hasActivity
      ? `${prelude.fleetDelta}${message.prompt}`
      : message.prompt;

    // Determine conversation mode
    const isFirstTurn = !conversation.claudeSessionId;
    const mode = isFirstTurn ? "first_turn" : "continue";

    // Create job event listener
    const listener: JobEventListener = (event) => {
      send(ws, event);

      // Update cursor on completion
      if (event.type === "job.completed" && event.ok) {
        conversationRepo.updateLastOutboxEventSeen(
          conversation.conversationId,
          prelude.newCursor
        );
      }
    };

    // Create the job with conversation binding
    await jobManager.createJob(
      {
        type: JOB_TYPE.COMMANDER_TURN,
        repoRoot: COMMANDER_CWD,
        model: MODEL.OPUS,
        conversation: {
          conversationId: conversation.conversationId,
          claudeSessionId: conversation.claudeSessionId ?? undefined,
          mode,
        },
        request: {
          prompt: fullPrompt,
          appendSystemPrompt: prelude.systemPrompt,
        },
      },
      listener
    );
  } catch (error) {
    send(ws, {
      type: "error",
      code: "COMMANDER_SEND_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    commanderTurnInProgress = false;
  }
}

/**
 * Handle commander.reset message.
 *
 * Resets the Commander conversation to start fresh.
 */
export function handleCommanderReset(
  deps: CommanderHandlerDependencies,
  ws: WebSocket
): void {
  const { send } = deps;

  try {
    const conversationRepo = new ConversationRepo();
    conversationRepo.resetCommander();

    // Could send a confirmation message, but for now just succeed silently
    // The next commander.send will start a fresh conversation
  } catch (error) {
    send(ws, {
      type: "error",
      code: "COMMANDER_RESET_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
