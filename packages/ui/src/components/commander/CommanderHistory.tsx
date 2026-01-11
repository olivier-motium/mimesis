/**
 * CommanderHistory - Displays persisted Commander conversation history.
 *
 * In production, this would load from SQLite jobs table.
 * Currently a placeholder for the UI structure.
 */

import { cn } from "../../lib/utils";
import { Clock } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface CommanderHistoryProps {
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CommanderHistory({ className }: CommanderHistoryProps) {
  // TODO: Load history from SQLite via API
  // For now, this is a placeholder

  return (
    <div className={cn("space-y-2", className)}>
      {/* Placeholder message */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground/50">
        <Clock className="w-3 h-3 mt-0.5" />
        <span>Previous conversations will appear here</span>
      </div>
    </div>
  );
}
