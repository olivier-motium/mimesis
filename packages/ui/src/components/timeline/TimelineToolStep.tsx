/**
 * TimelineToolStep - Renders a tool use event as an expandable card.
 *
 * Shows:
 * - Tool name and input (always visible)
 * - Captured stdout during execution (expandable)
 * - Tool result on completion
 * - Loading spinner while running
 */

import { useState } from "react";
import type { GroupedToolEvent } from "../../hooks/useSessionEvents";
import { cn } from "../../lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Loader2,
  Terminal,
  FileCode,
  Search,
  Edit,
  FolderOpen,
  Globe,
  HelpCircle,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface TimelineToolStepProps {
  event: GroupedToolEvent;
}

// Tool name to icon mapping
const TOOL_ICONS: Record<string, typeof Terminal> = {
  Bash: Terminal,
  Read: FileCode,
  Write: Edit,
  Edit: Edit,
  Grep: Search,
  Glob: FolderOpen,
  WebFetch: Globe,
  WebSearch: Globe,
  Task: Terminal,
};

// ============================================================================
// Component
// ============================================================================

export function TimelineToolStep({ event }: TimelineToolStepProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showInput, setShowInput] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const isRunning = event.completedAt === null;
  const isSuccess = event.ok === true;
  const Icon = TOOL_ICONS[event.toolName] ?? HelpCircle;

  // Format tool input for display
  const inputSummary = formatToolInput(event.toolName, event.toolInput);
  const hasStdout = event.stdout.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border",
        isRunning && "border-blue-500/50 bg-blue-500/5",
        !isRunning && isSuccess && "border-green-500/30 bg-green-500/5",
        !isRunning && !isSuccess && "border-red-500/30 bg-red-500/5"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 cursor-pointer",
          "hover:bg-muted/50 transition-colors"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse */}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}

        {/* Tool icon */}
        <Icon className="w-4 h-4 text-muted-foreground" />

        {/* Tool name */}
        <span className="font-mono text-sm font-medium">{event.toolName}</span>

        {/* Input summary */}
        <span className="flex-1 text-sm text-muted-foreground truncate">
          {inputSummary}
        </span>

        {/* Status indicator */}
        {isRunning ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        ) : isSuccess ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <X className="w-4 h-4 text-red-500" />
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border/50">
          {/* Tool input (collapsible) */}
          <div className="border-b border-border/50">
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/30 flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                setShowInput(!showInput);
              }}
            >
              {showInput ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Input
            </button>
            {showInput && (
              <pre className="px-3 py-2 text-xs font-mono bg-muted/30 overflow-x-auto max-h-48">
                {formatJson(event.toolInput)}
              </pre>
            )}
          </div>

          {/* Stdout output */}
          {hasStdout && (
            <div className="px-3 py-2 bg-black/20">
              <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap overflow-x-auto max-h-64">
                {event.stdout.join("")}
              </pre>
            </div>
          )}

          {/* Tool result (if completed) */}
          {event.completedAt !== null && (
            <div className="border-t border-border/50">
              <button
                className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/30 flex items-center gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowResult(!showResult);
                }}
              >
                {showResult ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Result {!isSuccess && "(error)"}
              </button>
              {showResult && (
                <pre className={cn(
                  "px-3 py-2 text-xs font-mono overflow-x-auto max-h-48",
                  isSuccess ? "bg-muted/30" : "bg-red-500/10"
                )}>
                  {formatJson(event.toolResult)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatToolInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") {
    return String(input ?? "");
  }

  const obj = input as Record<string, unknown>;

  // Tool-specific summaries
  switch (toolName) {
    case "Bash":
      return obj.command ? `$ ${truncate(String(obj.command), 60)}` : "";
    case "Read":
      return obj.file_path ? truncate(String(obj.file_path), 60) : "";
    case "Write":
      return obj.file_path ? truncate(String(obj.file_path), 60) : "";
    case "Edit":
      return obj.file_path ? truncate(String(obj.file_path), 60) : "";
    case "Grep":
      return obj.pattern ? `/${truncate(String(obj.pattern), 40)}/` : "";
    case "Glob":
      return obj.pattern ? truncate(String(obj.pattern), 60) : "";
    case "WebFetch":
      return obj.url ? truncate(String(obj.url), 60) : "";
    case "Task":
      return obj.description ? truncate(String(obj.description), 60) : "";
    default:
      // Generic: show first string value
      const firstValue = Object.values(obj).find((v) => typeof v === "string");
      return firstValue ? truncate(String(firstValue), 60) : "";
  }
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
