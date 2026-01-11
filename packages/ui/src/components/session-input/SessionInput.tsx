/**
 * SessionInput - Input composer for sending stdin to active session.
 *
 * Features:
 * - Multi-line text input
 * - Up/down arrow history recall
 * - Submit on Enter (Shift+Enter for newline)
 * - Cancel (SIGINT) button
 */

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { cn } from "../../lib/utils";
import { Send, Square, Loader2 } from "lucide-react";
import { InputHistory } from "./InputHistory";

// ============================================================================
// Types
// ============================================================================

export interface SessionInputProps {
  sessionId: string | null;
  sessionStatus: "working" | "waiting" | "idle";
  onSendStdin: (sessionId: string, data: string) => void;
  onSendSignal: (sessionId: string, signal: "SIGINT" | "SIGTERM" | "SIGKILL") => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function SessionInput({
  sessionId,
  sessionStatus,
  onSendStdin,
  onSendSignal,
  className,
}: SessionInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef(new InputHistory());

  const isDisabled = !sessionId;
  const isWorking = sessionStatus === "working";
  const canSubmit = value.trim().length > 0 && sessionId;
  const canCancel = isWorking && sessionId;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Submit handler
  const handleSubmit = useCallback(() => {
    if (!canSubmit || !sessionId) return;

    const text = value.trim();
    historyRef.current.add(text);
    onSendStdin(sessionId, text + "\n");
    setValue("");
    historyRef.current.reset();
  }, [canSubmit, sessionId, value, onSendStdin]);

  // Cancel handler
  const handleCancel = useCallback(() => {
    if (!canCancel || !sessionId) return;
    onSendSignal(sessionId, "SIGINT");
  }, [canCancel, sessionId, onSendSignal]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Cancel on Escape
    if (e.key === "Escape" && canCancel) {
      e.preventDefault();
      handleCancel();
      return;
    }

    // History navigation
    if (e.key === "ArrowUp" && value === "") {
      e.preventDefault();
      const prev = historyRef.current.previous();
      if (prev !== null) setValue(prev);
      return;
    }

    if (e.key === "ArrowDown" && value === historyRef.current.current()) {
      e.preventDefault();
      const next = historyRef.current.next();
      setValue(next ?? "");
      return;
    }
  }, [value, canCancel, handleSubmit, handleCancel]);

  return (
    <div className={cn(
      "flex items-end gap-2 p-3 border-t border-border bg-background",
      className
    )}>
      {/* Input area */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder={
            isDisabled
              ? "Select a session to send input..."
              : isWorking
              ? "Session is working... Press Esc to cancel"
              : "Type a message... (Enter to send, Shift+Enter for newline)"
          }
          className={cn(
            "w-full resize-none rounded-lg border border-border",
            "bg-muted/30 px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "min-h-[40px] max-h-[200px]"
          )}
          rows={1}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* Cancel button */}
        {canCancel && (
          <button
            onClick={handleCancel}
            className={cn(
              "flex items-center justify-center",
              "w-10 h-10 rounded-lg",
              "bg-red-500/10 text-red-500",
              "hover:bg-red-500/20 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-red-500/50"
            )}
            title="Cancel (SIGINT)"
          >
            <Square className="w-4 h-4" />
          </button>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            "flex items-center justify-center",
            "w-10 h-10 rounded-lg",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
          title="Send (Enter)"
        >
          {isWorking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
