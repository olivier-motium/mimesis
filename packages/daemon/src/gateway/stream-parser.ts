/**
 * Stream Parser - Parses stream-json output from headless Claude.
 *
 * Claude -p --output-format stream-json emits newline-delimited JSON objects
 * representing the streaming response. This module parses them into typed events.
 */

import type { StreamJsonChunk } from "./protocol.js";

export interface ParsedTextContent {
  type: "text";
  text: string;
  index: number;
}

export interface ParsedThinkingContent {
  type: "thinking";
  thinking: string;
  index: number;
}

export interface ParsedToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
  index: number;
}

export interface ParsedMessage {
  id: string;
  role: string;
  model: string;
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ParsedError {
  type: string;
  message: string;
}

export type StreamParserEvent =
  | { type: "content_start"; content: ParsedTextContent | ParsedThinkingContent | ParsedToolUseContent }
  | { type: "content_delta"; index: number; text?: string; thinking?: string; partialJson?: string }
  | { type: "content_stop"; index: number }
  | { type: "message_start"; message: ParsedMessage }
  | { type: "message_delta"; stopReason?: string }
  | { type: "message_stop" }
  | { type: "error"; error: ParsedError }
  | { type: "ping" };

/**
 * Parses a single stream-json line.
 */
export function parseStreamLine(line: string): StreamParserEvent | null {
  if (!line.trim()) return null;

  try {
    const chunk: StreamJsonChunk = JSON.parse(line);
    return transformChunk(chunk);
  } catch {
    return null;
  }
}

/**
 * Transform a StreamJsonChunk into a StreamParserEvent.
 */
function transformChunk(chunk: StreamJsonChunk): StreamParserEvent | null {
  switch (chunk.type) {
    case "content_block_start": {
      if (!chunk.content_block) return null;
      const cb = chunk.content_block;
      const index = chunk.index ?? 0;

      if (cb.type === "text") {
        return {
          type: "content_start",
          content: { type: "text", text: cb.text ?? "", index },
        };
      }
      if (cb.type === "thinking") {
        return {
          type: "content_start",
          content: { type: "thinking", thinking: cb.thinking ?? "", index },
        };
      }
      if (cb.type === "tool_use") {
        return {
          type: "content_start",
          content: {
            type: "tool_use",
            id: cb.id ?? "",
            name: cb.name ?? "",
            input: cb.input ?? {},
            index,
          },
        };
      }
      return null;
    }

    case "content_block_delta": {
      if (!chunk.delta) return null;
      const index = chunk.index ?? 0;

      return {
        type: "content_delta",
        index,
        text: chunk.delta.text,
        thinking: chunk.delta.thinking,
        partialJson: chunk.delta.partial_json,
      };
    }

    case "content_block_stop": {
      return {
        type: "content_stop",
        index: chunk.index ?? 0,
      };
    }

    case "message_start": {
      if (!chunk.message) return null;
      const msg = chunk.message;

      return {
        type: "message_start",
        message: {
          id: msg.id,
          role: msg.role,
          model: msg.model,
          stopReason: msg.stop_reason,
          usage: msg.usage ? {
            inputTokens: msg.usage.input_tokens,
            outputTokens: msg.usage.output_tokens,
          } : undefined,
        },
      };
    }

    case "message_delta": {
      return {
        type: "message_delta",
        stopReason: chunk.delta?.stop_reason,
      };
    }

    case "message_stop": {
      return { type: "message_stop" };
    }

    case "error": {
      if (!chunk.error) return null;
      return {
        type: "error",
        error: {
          type: chunk.error.type,
          message: chunk.error.message,
        },
      };
    }

    case "ping": {
      return { type: "ping" };
    }

    default:
      return null;
  }
}

/**
 * Streaming parser that accumulates content across deltas.
 */
export class StreamParser {
  private contents: Map<number, {
    type: "text" | "thinking" | "tool_use";
    accumulated: string;
    toolName?: string;
    toolId?: string;
  }> = new Map();

  private message: ParsedMessage | null = null;

  /**
   * Parse a line and return accumulated state.
   */
  parse(line: string): StreamParserEvent | null {
    const event = parseStreamLine(line);
    if (!event) return null;

    // Track state for content blocks
    if (event.type === "content_start") {
      const content = event.content;
      if (content.type === "text") {
        this.contents.set(content.index, {
          type: "text",
          accumulated: content.text,
        });
      } else if (content.type === "thinking") {
        this.contents.set(content.index, {
          type: "thinking",
          accumulated: content.thinking,
        });
      } else if (content.type === "tool_use") {
        this.contents.set(content.index, {
          type: "tool_use",
          accumulated: "",
          toolName: content.name,
          toolId: content.id,
        });
      }
    } else if (event.type === "content_delta") {
      const content = this.contents.get(event.index);
      if (content) {
        if (event.text) content.accumulated += event.text;
        if (event.thinking) content.accumulated += event.thinking;
        if (event.partialJson) content.accumulated += event.partialJson;
      }
    } else if (event.type === "message_start") {
      this.message = event.message;
    }

    return event;
  }

  /**
   * Get accumulated text content.
   */
  getText(): string {
    const textContents = Array.from(this.contents.values())
      .filter((c) => c.type === "text")
      .map((c) => c.accumulated);
    return textContents.join("");
  }

  /**
   * Get accumulated thinking content.
   */
  getThinking(): string {
    const thinkingContents = Array.from(this.contents.values())
      .filter((c) => c.type === "thinking")
      .map((c) => c.accumulated);
    return thinkingContents.join("");
  }

  /**
   * Get tool uses.
   */
  getToolUses(): Array<{ id: string; name: string; input: unknown }> {
    const toolContents = Array.from(this.contents.values())
      .filter((c) => c.type === "tool_use");

    return toolContents.map((c) => ({
      id: c.toolId ?? "",
      name: c.toolName ?? "",
      input: c.accumulated ? JSON.parse(c.accumulated) : {},
    }));
  }

  /**
   * Get the message info.
   */
  getMessage(): ParsedMessage | null {
    return this.message;
  }

  /**
   * Reset parser state.
   */
  reset(): void {
    this.contents.clear();
    this.message = null;
  }
}
