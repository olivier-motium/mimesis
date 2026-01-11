/**
 * TimelineStdout - Renders standalone PTY output blocks.
 *
 * For stdout not associated with a tool execution.
 * Expanded by default with monospace styling.
 */

import type { StdoutEvent } from "../../hooks/useSessionEvents";
import { cn } from "../../lib/utils";
import { Terminal } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface TimelineStdoutProps {
  event: StdoutEvent;
}

// ============================================================================
// Component
// ============================================================================

export function TimelineStdout({ event }: TimelineStdoutProps) {
  // Skip empty output
  if (!event.data.trim()) {
    return null;
  }

  return (
    <div className={cn(
      "rounded-lg border border-border/30",
      "bg-black/30"
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30">
        <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Output</span>
      </div>

      {/* Content */}
      <pre className={cn(
        "px-3 py-2 text-xs font-mono",
        "text-foreground/80 whitespace-pre-wrap",
        "overflow-x-auto max-h-48"
      )}>
        {event.data}
      </pre>
    </div>
  );
}
