/**
 * CommanderTab - Separate tab for Commander (Opus) conversations.
 *
 * PTY-based Commander features:
 * - Persistent PTY session with queue-based prompts
 * - Cross-project intelligence queries
 * - Shows queue status when prompts are pending
 * - Cancel button sends SIGINT
 */

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import type { CommanderState, SequencedSessionEvent } from "../../hooks/useGateway";
import { useCommanderEvents } from "../../hooks/useCommanderEvents";
import { cn } from "../../lib/utils";
import { CommanderHistory } from "./CommanderHistory";
import { CommanderInput } from "./CommanderInput";
import { CommanderTimeline } from "./CommanderTimeline";
import { Brain, Sparkles, RotateCcw, Clock, Terminal, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { stripAnsi } from "../../lib/ansi";

// ============================================================================
// Types
// ============================================================================

export interface CommanderTabProps {
  commanderState: CommanderState;
  commanderEvents: SequencedSessionEvent[];
  commanderContentEvents: SequencedSessionEvent[];
  onSendPrompt: (prompt: string) => void;
  onCancel: () => void;
  onResetConversation: () => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CommanderTab({
  commanderState,
  commanderEvents,
  commanderContentEvents,
  onSendPrompt,
  onCancel,
  onResetConversation,
  className,
}: CommanderTabProps) {
  const isRunning = commanderState.status === "working";
  const isWaiting = commanderState.status === "waiting_for_input";
  const hasQueuedPrompts = commanderState.queuedPrompts > 0;
  const hasSession = commanderState.ptySessionId !== null;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll tracking - same pattern as Timeline
  const [isScrolledAway, setScrolledAway] = useState(false);
  const wasAtBottomRef = useRef(true);
  const isAutoScrollingRef = useRef(false);

  // Process structured content events for timeline display
  const { events: structuredEvents, hasContent } = useCommanderEvents(commanderContentEvents);

  // Fallback: Process raw PTY stdout when structured content isn't available
  const rawStdoutContent = useMemo(() => {
    if (hasContent) return null; // Prefer structured content

    // Extract stdout from raw PTY events
    const stdoutEvents = commanderEvents
      .filter((e) => e.type === "stdout")
      .map((e) => (e as { data: string }).data)
      .join("");

    if (!stdoutEvents) return null;

    // Strip ANSI codes and clean up
    return stripAnsi(stdoutEvents);
  }, [commanderEvents, hasContent]);

  // Handle scroll to detect when user scrolls away
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    // Ignore scroll events during programmatic auto-scrolling
    if (isAutoScrollingRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    // Only notify of changes
    if (isAtBottom && isScrolledAway) {
      setScrolledAway(false);
    } else if (!isAtBottom && !isScrolledAway && wasAtBottomRef.current) {
      setScrolledAway(true);
    }

    wasAtBottomRef.current = isAtBottom;
  }, [isScrolledAway]);

  // Auto-scroll to bottom when new content arrives (if at bottom)
  useEffect(() => {
    if (scrollRef.current && !isScrolledAway) {
      isAutoScrollingRef.current = true;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 100);
    }
  }, [structuredEvents.length, rawStdoutContent, isScrolledAway]);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      isAutoScrollingRef.current = true;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setScrolledAway(false);
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 100);
    }
  }, []);

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
          {/* Queue indicator */}
          {hasQueuedPrompts && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 text-xs">
              <Clock className="w-3 h-3" />
              <span>{commanderState.queuedPrompts} queued</span>
            </div>
          )}

          {/* Status indicator */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-xs",
            isRunning && "bg-purple-500/10 text-purple-600",
            isWaiting && "bg-green-500/10 text-green-600",
            !hasSession && "bg-muted text-muted-foreground"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isRunning && "bg-purple-500 animate-pulse",
              isWaiting && "bg-green-500",
              !hasSession && "bg-muted-foreground"
            )} />
            <span>
              {isRunning ? "Working" : isWaiting ? "Ready" : "Idle"}
            </span>
          </div>

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
      <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-4">
        {/* History (placeholder - would load from SQLite) */}
        <CommanderHistory />

        {/* Session info */}
        {hasSession && (
          <div className="text-xs text-muted-foreground border-b border-border pb-2">
            <span className="font-mono">
              Session: {commanderState.claudeSessionId ?? commanderState.ptySessionId}
            </span>
            {commanderState.isFirstTurn && (
              <span className="ml-2 text-amber-600">(New conversation)</span>
            )}
          </div>
        )}

        {/* Structured content display */}
        {hasContent && (
          <div className="flex-1 min-h-0 rounded-lg border border-border/30 bg-muted/5 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 shrink-0">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Commander Output</span>
              {isRunning && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-purple-500">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  <span>Working...</span>
                </div>
              )}
            </div>
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto px-3 py-2 relative"
              onScroll={handleScroll}
            >
              <CommanderTimeline events={structuredEvents} />
              {/* Scroll to bottom button */}
              {isScrolledAway && structuredEvents.length > 0 && (
                <button
                  onClick={scrollToBottom}
                  className={cn(
                    "sticky bottom-2 left-1/2 -translate-x-1/2 z-10",
                    "px-3 py-1.5 rounded-full",
                    "bg-purple-500 text-white",
                    "shadow-lg hover:bg-purple-600",
                    "text-xs font-medium",
                    "flex items-center gap-1",
                    "transition-opacity"
                  )}
                >
                  <ChevronDown className="w-3 h-3" />
                  New messages
                </button>
              )}
            </div>
          </div>
        )}

        {/* Raw stdout fallback (when structured content isn't available) */}
        {!hasContent && rawStdoutContent && (
          <div className="flex-1 min-h-0 rounded-lg border border-border/30 bg-muted/5 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 shrink-0">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Commander Output (Raw)</span>
              {isRunning && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-purple-500">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  <span>Working...</span>
                </div>
              )}
            </div>
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto px-3 py-2 relative"
              onScroll={handleScroll}
            >
              <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap">
                {rawStdoutContent}
              </pre>
              {/* Scroll to bottom button */}
              {isScrolledAway && rawStdoutContent && (
                <button
                  onClick={scrollToBottom}
                  className={cn(
                    "sticky bottom-2 left-1/2 -translate-x-1/2 z-10",
                    "px-3 py-1.5 rounded-full",
                    "bg-purple-500 text-white",
                    "shadow-lg hover:bg-purple-600",
                    "text-xs font-medium",
                    "flex items-center gap-1",
                    "transition-opacity"
                  )}
                >
                  <ChevronDown className="w-3 h-3" />
                  New messages
                </button>
              )}
            </div>
          </div>
        )}

        {/* Working indicator (shown only when no structured content yet) */}
        {isRunning && !hasContent && (
          <div className={cn(
            "rounded-lg border p-4 border-purple-500/30 bg-purple-500/5"
          )}>
            <div className="flex items-center gap-2 text-sm text-purple-600">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span>Commander is thinking...</span>
            </div>
            {hasQueuedPrompts && (
              <p className="text-xs text-muted-foreground mt-2">
                {commanderState.queuedPrompts} more prompt(s) will be processed after this
              </p>
            )}
          </div>
        )}

        {/* Empty state */}
        {!hasSession && !isRunning && !hasContent && (
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
        onCancel={onCancel}
        isRunning={isRunning}
        queuedPrompts={commanderState.queuedPrompts}
      />
    </div>
  );
}
