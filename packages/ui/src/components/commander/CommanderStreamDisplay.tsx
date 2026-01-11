/**
 * CommanderStreamDisplay - Renders streaming Commander output.
 *
 * Shows text, thinking, and tool uses as they stream in.
 */

import { useState } from "react";
import { cn } from "../../lib/utils";
import { Brain, ChevronDown, ChevronRight, Loader2, AlertCircle } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface CommanderStreamDisplayProps {
  content: {
    text: string;
    thinking: string;
    toolUses: Array<{ id: string; name: string; input: unknown }>;
  } | null;
  isRunning: boolean;
  error?: string;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CommanderStreamDisplay({
  content,
  isRunning,
  error,
  className,
}: CommanderStreamDisplayProps) {
  const [showThinking, setShowThinking] = useState(false);

  if (error) {
    return (
      <div className={cn("flex items-start gap-2 text-red-500", className)}>
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Initializing...</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Thinking (collapsible) */}
      {content.thinking && (
        <div className="rounded border border-dashed border-border/50 bg-muted/20">
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors"
            onClick={() => setShowThinking(!showThinking)}
          >
            {showThinking ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
            <Brain className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Thinking</span>
          </button>
          {showThinking && (
            <div className="px-3 py-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {content.thinking}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main text content */}
      {content.text && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap">{content.text}</p>
        </div>
      )}

      {/* Tool uses */}
      {content.toolUses.length > 0 && (
        <div className="space-y-2">
          {content.toolUses.map((tool) => (
            <div
              key={tool.id}
              className="rounded border border-border/50 bg-muted/20 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium">{tool.name}</span>
              </div>
              {tool.input && (
                <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto">
                  {typeof tool.input === "string"
                    ? tool.input
                    : JSON.stringify(tool.input, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Running indicator */}
      {isRunning && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">Streaming...</span>
        </div>
      )}
    </div>
  );
}
