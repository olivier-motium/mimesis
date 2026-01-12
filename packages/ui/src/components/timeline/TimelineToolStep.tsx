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
  const isRunning = event.completedAt === null;
  const isSuccess = event.ok === true;
  const Icon = TOOL_ICONS[event.toolName] ?? HelpCircle;

  // Running tools stay expanded for visibility; completed tools collapse for density
  const [isExpanded, setIsExpanded] = useState(isRunning);
  const [showInput, setShowInput] = useState(false);
  const [showResult, setShowResult] = useState(false);

  // Format tool input for display
  const inputSummary = formatToolInput(event.toolName, event.toolInput);
  const hasStdout = event.stdout.length > 0;

  return (
    <div
      className={cn(
        "rounded-sm border border-border/30",
        isRunning && "bg-blue-500/5",
        !isRunning && isSuccess && "bg-transparent",
        !isRunning && !isSuccess && "bg-red-500/5 border-red-500/20"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 cursor-pointer",
          "hover:bg-muted/30 transition-colors"
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

      {/* Expanded content - only show details when tool has completed */}
      {isExpanded && !isRunning && (
        <div className="border-t border-border/30">
          {/* Tool input (collapsible) */}
          <div className="border-b border-border/30">
            <button
              className="w-full px-2 py-0.5 text-left text-xs text-muted-foreground/70 hover:bg-muted/30 flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                setShowInput(!showInput);
              }}
            >
              {showInput ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Input
            </button>
            {showInput && (
              <pre className="px-2 py-1.5 text-xs font-mono bg-muted/30 overflow-x-auto max-h-32">
                {formatJson(event.toolInput)}
              </pre>
            )}
          </div>

          {/* Stdout output */}
          {hasStdout && (
            <div className="px-2 py-1 bg-black/20">
              <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap overflow-x-auto max-h-40">
                {event.stdout.join("")}
              </pre>
            </div>
          )}

          {/* Tool result */}
          <div className="border-t border-border/30">
            <button
              className="w-full px-2 py-0.5 text-left text-xs text-muted-foreground/70 hover:bg-muted/30 flex items-center gap-1"
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
                "px-2 py-1.5 text-xs font-mono overflow-x-auto max-h-32",
                isSuccess ? "bg-muted/30" : "bg-red-500/10"
              )}>
                {formatJson(event.toolResult, true)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Running tool - just show stdout if any */}
      {isExpanded && isRunning && hasStdout && (
        <div className="border-t border-border/30 px-2 py-1 bg-black/20">
          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap overflow-x-auto max-h-40">
            {event.stdout.join("")}
          </pre>
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

  // Tool-specific summaries with smart path truncation for file operations
  switch (toolName) {
    case "Bash":
      return obj.command ? `$ ${truncate(String(obj.command), 70)}` : "";
    case "Read":
      return obj.file_path ? smartTruncatePath(String(obj.file_path), 60) : "";
    case "Write":
      return obj.file_path ? smartTruncatePath(String(obj.file_path), 60) : "";
    case "Edit":
      return obj.file_path ? smartTruncatePath(String(obj.file_path), 60) : "";
    case "Grep":
      return obj.pattern ? `/${truncate(String(obj.pattern), 50)}/` : "";
    case "Glob":
      return obj.pattern ? truncate(String(obj.pattern), 70) : "";
    case "WebFetch":
      return obj.url ? truncate(String(obj.url), 70) : "";
    case "Task":
      return obj.description ? truncate(String(obj.description), 70) : "";
    default:
      // Generic: show first string value
      const firstValue = Object.values(obj).find((v) => typeof v === "string");
      return firstValue ? truncate(String(firstValue), 70) : "";
  }
}

function formatJson(value: unknown, stripNumbers: boolean = false): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return stripNumbers ? stripLineNumbers(value) : value;
  }
  try {
    const json = JSON.stringify(value, null, 2);
    return stripNumbers ? stripLineNumbers(json) : json;
  } catch {
    return String(value);
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * Strip line number prefixes from file content (e.g., "    1→content" -> "content")
 * These are added by the Read tool but add visual clutter in the UI.
 */
function stripLineNumbers(content: string): string {
  if (typeof content !== "string") return String(content);
  // Match lines like "    1→content" or "   42→content" (spaces + number + arrow)
  return content.replace(/^\s*\d+→/gm, "");
}

/**
 * Smart path truncation - shows basename and abbreviated parent context
 * "/Users/foo/project/src/components/Button.tsx" -> "...src/components/Button.tsx"
 */
function smartTruncatePath(path: string, maxLen: number = 50): string {
  if (path.length <= maxLen) return path;

  const parts = path.split("/");
  if (parts.length <= 3) return truncate(path, maxLen);

  // Keep last 3 segments
  const tail = parts.slice(-3).join("/");
  if (tail.length <= maxLen - 3) {
    return ".../" + tail;
  }
  return ".../" + parts.slice(-2).join("/");
}
