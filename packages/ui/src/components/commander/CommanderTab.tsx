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
import { CommanderInput } from "./CommanderInput";
import { CommanderTimeline } from "./CommanderTimeline";
import { Brain, RotateCcw, ChevronDown } from "lucide-react";
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
      {/* Simplified Header - status moved to TacticalIntel */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-500" />
          <h2 className="text-sm font-medium text-foreground/80">Commander</h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Only show reset when there's content */}
          {hasSession && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetConversation}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              disabled={isRunning}
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Content area - streamlined without nested headers */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Structured content display - clean, no nested header */}
        {hasContent && (
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto px-4 py-3 relative"
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
        )}

        {/* Raw stdout fallback */}
        {!hasContent && rawStdoutContent && (
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto px-4 py-3 relative"
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
        )}

        {/* Working indicator (shown only when no structured content yet) */}
        {isRunning && !hasContent && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-purple-500/70">
              <div className="w-4 h-4 border-2 border-purple-500/50 border-t-transparent rounded-full animate-spin" />
              <span>Thinking...</span>
            </div>
          </div>
        )}

        {/* Empty state - minimal and inviting */}
        {!hasSession && !isRunning && !hasContent && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <p className="text-sm text-muted-foreground/60 max-w-xs">
              Ask about fleet status, coordinate across projects, or get summaries
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
