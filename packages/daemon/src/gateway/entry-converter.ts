/**
 * Entry Converter - Converts JSONL LogEntry[] to WebSocket SessionEvent[]
 *
 * This module bridges the gap between watcher-parsed session logs and
 * the Timeline UI event format. Enables full chat history display for
 * external (non-PTY) sessions.
 */

import type {
  LogEntry,
  UserEntry,
  AssistantEntry,
  SystemEntry,
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
  ToolResultBlock,
} from "../types.js";
import type { SessionEvent, TextEvent, ToolEvent, ThinkingEvent } from "./protocol.js";

// =============================================================================
// Types
// =============================================================================

export interface ConversionResult {
  events: SessionEvent[];
  lastSeq: number;
}

// Map tool_use IDs to their pre-event data for pairing with results
interface PendingToolUse {
  toolName: string;
  toolInput: unknown;
  timestamp: string;
}

// =============================================================================
// Main Converter
// =============================================================================

/**
 * Convert parsed JSONL log entries to WebSocket session events.
 *
 * Handles:
 * - UserEntry: User prompts and tool results
 * - AssistantEntry: Claude responses (text, tool_use, thinking)
 * - SystemEntry: Hook summaries
 *
 * @param entries - Array of parsed log entries from session JSONL
 * @returns Converted events and the last sequence number used
 */
export function convertEntriesToEvents(entries: LogEntry[]): ConversionResult {
  const events: SessionEvent[] = [];
  let seq = 0;

  // Track pending tool uses to pair with results
  const pendingTools = new Map<string, PendingToolUse>();

  for (const entry of entries) {
    switch (entry.type) {
      case "user":
        seq = convertUserEntry(entry, events, seq, pendingTools);
        break;

      case "assistant":
        seq = convertAssistantEntry(entry, events, seq, pendingTools);
        break;

      case "system":
        seq = convertSystemEntry(entry, events, seq);
        break;

      // Skip queue-operation and file-history-snapshot entries
      // These are internal tracking, not conversation content
    }
  }

  return { events, lastSeq: seq };
}

// =============================================================================
// Entry Converters
// =============================================================================

/**
 * Convert UserEntry to events.
 * User entries contain either:
 * - String content: A user prompt
 * - ToolResultBlock[]: Results from tool executions
 */
function convertUserEntry(
  entry: UserEntry,
  events: SessionEvent[],
  seq: number,
  pendingTools: Map<string, PendingToolUse>
): number {
  const timestamp = entry.timestamp;
  const content = entry.message.content;

  if (typeof content === "string") {
    // User prompt
    events.push(createTextEvent(content, timestamp, "user"));
    return seq + 1;
  }

  // Tool results - content is ToolResultBlock[]
  for (const block of content as ToolResultBlock[]) {
    if (block.type === "tool_result") {
      const pending = pendingTools.get(block.tool_use_id);
      if (pending) {
        // Found matching pre event - create post event with result
        events.push(createToolPostEvent(
          pending.toolName,
          pending.toolInput,
          block.content,
          true, // ok
          timestamp
        ));
        pendingTools.delete(block.tool_use_id);
      } else {
        // Orphan result - create standalone post event
        events.push(createToolPostEvent(
          "Unknown",
          undefined,
          block.content,
          true,
          timestamp
        ));
      }
    }
  }

  return seq + (content as ToolResultBlock[]).length;
}

/**
 * Convert AssistantEntry to events.
 * Assistant entries contain content blocks:
 * - TextBlock: Claude's text response
 * - ToolUseBlock: Tool invocation
 * - ThinkingBlock: Internal reasoning
 */
function convertAssistantEntry(
  entry: AssistantEntry,
  events: SessionEvent[],
  seq: number,
  pendingTools: Map<string, PendingToolUse>
): number {
  const timestamp = entry.timestamp;
  const contentBlocks = entry.message.content;

  for (const block of contentBlocks) {
    switch (block.type) {
      case "text": {
        const textBlock = block as TextBlock;
        if (textBlock.text.trim()) {
          events.push(createTextEvent(textBlock.text, timestamp, "assistant"));
          seq++;
        }
        break;
      }

      case "tool_use": {
        const toolBlock = block as ToolUseBlock;
        // Store for pairing with result
        pendingTools.set(toolBlock.id, {
          toolName: toolBlock.name,
          toolInput: toolBlock.input,
          timestamp,
        });
        // Create pre event
        events.push(createToolPreEvent(toolBlock.name, toolBlock.input, timestamp));
        seq++;
        break;
      }

      case "thinking": {
        const thinkingBlock = block as ThinkingBlock;
        if (thinkingBlock.thinking.trim()) {
          events.push(createThinkingEvent(thinkingBlock.thinking, timestamp));
          seq++;
        }
        break;
      }
    }
  }

  return seq;
}

/**
 * Convert SystemEntry to events.
 * Only converts meaningful system events like hook summaries.
 */
function convertSystemEntry(
  entry: SystemEntry,
  events: SessionEvent[],
  seq: number
): number {
  const timestamp = entry.timestamp;

  // Only include stop_hook_summary entries as they contain useful info
  if (entry.subtype === "stop_hook_summary" && entry.hasOutput) {
    events.push(createTextEvent(
      `[Hook Summary] ${entry.stopReason ?? "Session ended"}`,
      timestamp,
      "system"
    ));
    return seq + 1;
  }

  // Skip turn_duration and other internal system entries
  return seq;
}

// =============================================================================
// Event Factories
// =============================================================================

/**
 * Create a text event for user prompts, assistant responses, or system messages.
 */
function createTextEvent(
  text: string,
  timestamp: string,
  _source: "user" | "assistant" | "system"
): TextEvent {
  return {
    type: "text",
    data: text,
    timestamp,
  };
}

/**
 * Create a tool pre-event (before execution).
 */
function createToolPreEvent(
  toolName: string,
  toolInput: unknown,
  timestamp: string
): ToolEvent {
  return {
    type: "tool",
    phase: "pre",
    tool_name: toolName,
    tool_input: toolInput,
    timestamp,
  };
}

/**
 * Create a tool post-event (after execution with result).
 */
function createToolPostEvent(
  toolName: string,
  toolInput: unknown,
  toolResult: unknown,
  ok: boolean,
  timestamp: string
): ToolEvent {
  return {
    type: "tool",
    phase: "post",
    tool_name: toolName,
    tool_input: toolInput,
    tool_result: toolResult,
    ok,
    timestamp,
  };
}

/**
 * Create a thinking event for model reasoning.
 */
function createThinkingEvent(thinking: string, timestamp: string): ThinkingEvent {
  return {
    type: "thinking",
    data: thinking,
    timestamp,
  };
}
