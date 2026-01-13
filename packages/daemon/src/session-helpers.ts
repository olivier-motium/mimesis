/**
 * Session helper functions for extracting display data from log entries.
 *
 * These helpers transform raw session data into structured formats
 * for UI display without requiring access to the StreamServer instance.
 */

import type { Session, RecentOutput } from "./schema.js";
import type { SessionState } from "./watcher.js";
import type { LogEntry } from "./types.js";
import {
  MESSAGE_LOOKBACK_COUNT,
  RECENT_OUTPUT_MAX_ITEMS,
  CONTENT_PREVIEW_LENGTH,
  CONTENT_TRUNCATE_LENGTH,
} from "./config/index.js";
import { formatToolUse, extractToolTarget } from "./tools/index.js";

/**
 * Extract recent output from entries for live view.
 * Returns the last few meaningful messages in chronological order.
 */
export function extractRecentOutput(
  entries: LogEntry[],
  maxItems = RECENT_OUTPUT_MAX_ITEMS
): RecentOutput[] {
  const output: RecentOutput[] = [];

  // Get the last N entries that are messages (user or assistant)
  const messageEntries = entries
    .filter((e) => e.type === "user" || e.type === "assistant")
    .slice(-MESSAGE_LOOKBACK_COUNT);

  for (const entry of messageEntries) {
    if (entry.type === "assistant") {
      // Get first text block if any
      const textBlock = entry.message.content.find(
        (b): b is { type: "text"; text: string } =>
          b.type === "text" && b.text.trim() !== ""
      );
      if (textBlock) {
        output.push({
          role: "assistant",
          content: textBlock.text.slice(0, CONTENT_PREVIEW_LENGTH),
        });
      }

      // Get tool uses
      const toolUses = entry.message.content.filter(
        (b): b is {
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, unknown>;
        } => b.type === "tool_use"
      );
      for (const tool of toolUses.slice(0, 2)) {
        output.push({
          role: "tool",
          content: formatToolUse(tool.name, tool.input),
        });
      }
    } else if (entry.type === "user") {
      // User prompts (string content, not tool results)
      if (typeof entry.message.content === "string" && entry.message.content.trim()) {
        output.push({
          role: "user",
          content: entry.message.content.slice(0, CONTENT_TRUNCATE_LENGTH),
        });
      }
    }
  }

  // Return only the last maxItems
  return output.slice(-maxItems);
}

/**
 * Extract pending tool info from session state.
 * Uses the tool registry for target extraction.
 */
export function extractPendingTool(session: SessionState): Session["pendingTool"] {
  if (!session.status.hasPendingToolUse) {
    return null;
  }

  // Find the last assistant message with tool_use
  const entries = session.entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "assistant") {
      for (const block of entry.message.content) {
        if (block.type === "tool_use") {
          const tool = block.name;
          const input = block.input as Record<string, unknown>;
          const target = extractToolTarget(tool, input);
          return { tool, target };
        }
      }
    }
  }

  return null;
}
