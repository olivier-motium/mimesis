/**
 * CommanderTab - Separate tab for Commander (Opus) conversations.
 *
 * Features:
 * - Cross-project intelligence queries
 * - Persisted conversation history from SQLite
 * - Streaming response display
 */

import type { JobState, JobStreamChunk } from "../../hooks/useGateway";
import { cn } from "../../lib/utils";
import { CommanderHistory } from "./CommanderHistory";
import { CommanderInput } from "./CommanderInput";
import { CommanderStreamDisplay } from "./CommanderStreamDisplay";
import { Brain, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";

// ============================================================================
// Types
// ============================================================================

export interface CommanderTabProps {
  activeJob: JobState | null;
  onSendPrompt: (prompt: string) => void;
  onCancelJob: () => void;
  onResetConversation: () => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CommanderTab({
  activeJob,
  onSendPrompt,
  onCancelJob,
  onResetConversation,
  className,
}: CommanderTabProps) {
  const isRunning = activeJob?.status === "running";
  const hasResult = activeJob?.status === "completed" || activeJob?.status === "failed";

  // Parse stream events for display
  const streamContent = activeJob ? parseStreamEvents(activeJob.events) : null;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10">
          <Brain className="w-4 h-4 text-purple-500" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Commander</h2>
          <p className="text-xs text-muted-foreground">
            Cross-project intelligence powered by Opus
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetConversation}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={isRunning}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            New Conversation
          </Button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="w-3 h-3" />
            <span>Opus 4</span>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* History (placeholder - would load from SQLite) */}
        <CommanderHistory />

        {/* Active job stream */}
        {activeJob && (
          <div className={cn(
            "rounded-lg border p-4",
            isRunning && "border-purple-500/30 bg-purple-500/5",
            activeJob.status === "completed" && "border-green-500/30 bg-green-500/5",
            activeJob.status === "failed" && "border-red-500/30 bg-red-500/5"
          )}>
            <CommanderStreamDisplay
              content={streamContent}
              isRunning={isRunning}
              error={activeJob.error}
            />
          </div>
        )}

        {/* Empty state */}
        {!activeJob && (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Brain className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">
              Ask Commander about your fleet
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Cross-project queries, status summaries, and coordination
            </p>
          </div>
        )}
      </div>

      {/* Input area */}
      <CommanderInput
        onSubmit={onSendPrompt}
        onCancel={onCancelJob}
        isRunning={isRunning}
      />
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

interface ParsedStreamContent {
  text: string;
  thinking: string;
  toolUses: Array<{ id: string; name: string; input: unknown }>;
}

function parseStreamEvents(events: JobStreamChunk[]): ParsedStreamContent {
  const result: ParsedStreamContent = {
    text: "",
    thinking: "",
    toolUses: [],
  };

  for (const event of events) {
    // Claude CLI stream-json outputs JSONL log entries, not API stream events.
    // Handle "assistant" type which contains message.content array with text/thinking.
    if (event.type === "assistant") {
      const message = (event as { message?: { content?: unknown[] } }).message;
      const content = message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== "object" || block === null) continue;
          const b = block as { type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: unknown };

          if (b.type === "text" && b.text) {
            result.text += b.text;
          } else if (b.type === "thinking" && b.thinking) {
            result.thinking += b.thinking;
          } else if (b.type === "tool_use") {
            result.toolUses.push({
              id: b.id ?? "",
              name: b.name ?? "",
              input: b.input,
            });
          }
        }
      }
    }

    // Also handle API-level stream events for future compatibility
    if (event.type === "content_block_delta") {
      const delta = event.delta as { text?: string; thinking?: string } | undefined;
      if (delta?.text) {
        result.text += delta.text;
      }
      if (delta?.thinking) {
        result.thinking += delta.thinking;
      }
    }

    if (event.type === "content_block_start") {
      const contentBlock = event.content_block as { type: string; id?: string; name?: string; input?: unknown } | undefined;
      if (contentBlock?.type === "tool_use") {
        result.toolUses.push({
          id: contentBlock.id ?? "",
          name: contentBlock.name ?? "",
          input: contentBlock.input,
        });
      }
    }
  }

  return result;
}
