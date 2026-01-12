/**
 * CommanderInput - Input composer for Commander prompts.
 *
 * Similar to SessionInput but styled for Commander context.
 */

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { cn } from "../../lib/utils";
import { Send, Square, Loader2 } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface CommanderInputProps {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  isRunning: boolean;
  queuedPrompts?: number;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CommanderInput({
  onSubmit,
  onCancel,
  isRunning,
  queuedPrompts = 0,
  className,
}: CommanderInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Allow submission even when running (will be queued)
  const canSubmit = value.trim().length > 0;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [value]);

  // Submit handler
  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;

    const prompt = value.trim();
    onSubmit(prompt);
    setValue("");
  }, [canSubmit, value, onSubmit]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Cancel on Escape
    if (e.key === "Escape" && isRunning) {
      e.preventDefault();
      onCancel();
      return;
    }
  }, [isRunning, handleSubmit, onCancel]);

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
          placeholder={
            isRunning
              ? queuedPrompts > 0
                ? `Commander is working (${queuedPrompts} queued)... Type to queue more, Esc to cancel`
                : "Commander is thinking... Type to queue, Esc to cancel"
              : "Ask Commander about your fleet... (Enter to send)"
          }
          className={cn(
            "w-full resize-none rounded-lg border border-border",
            "bg-muted/30 px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "min-h-[40px] max-h-[150px]"
          )}
          rows={1}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* Cancel button */}
        {isRunning && (
          <button
            onClick={onCancel}
            className={cn(
              "flex items-center justify-center",
              "w-10 h-10 rounded-lg",
              "bg-red-500/10 text-red-500",
              "hover:bg-red-500/20 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-red-500/50"
            )}
            title="Cancel"
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
            "bg-purple-500 text-white",
            "hover:bg-purple-600 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          )}
          title="Send (Enter)"
        >
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
