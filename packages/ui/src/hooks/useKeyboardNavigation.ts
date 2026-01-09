/**
 * Keyboard navigation hook for Command Center
 *
 * Provides RTS-style keyboard shortcuts:
 * - ↑/↓: Navigate table rows
 * - Enter: Attach terminal to selected session
 * - Escape: Deselect / collapse terminal
 * - I: Filter to needs-input
 * - E: Filter to errors
 * - S: Filter to stale
 * - A: Filter to all
 */

import { useEffect, useCallback } from "react";
import type { StatusFilter } from "../components/ops-table/types";
import type { Session } from "../types/schema";

interface UseKeyboardNavigationOptions {
  sessions: Session[];
  selectedSessionId: string | null;
  filter: StatusFilter;
  onSelectSession: (sessionId: string | null) => void;
  onFilterChange: (filter: StatusFilter) => void;
  /** If true, keyboard shortcuts are disabled (e.g., when typing in an input) */
  disabled?: boolean;
}

export function useKeyboardNavigation({
  sessions,
  selectedSessionId,
  filter,
  onSelectSession,
  onFilterChange,
  disabled = false,
}: UseKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if disabled or in an input field
      if (disabled) return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Find current selection index
      const currentIndex = sessions.findIndex(
        (s) => s.sessionId === selectedSessionId
      );

      switch (event.key) {
        case "ArrowUp": {
          event.preventDefault();
          if (sessions.length === 0) return;

          if (currentIndex <= 0) {
            // Select last item if at top or none selected
            onSelectSession(sessions[sessions.length - 1].sessionId);
          } else {
            onSelectSession(sessions[currentIndex - 1].sessionId);
          }
          break;
        }

        case "ArrowDown": {
          event.preventDefault();
          if (sessions.length === 0) return;

          if (currentIndex < 0 || currentIndex >= sessions.length - 1) {
            // Select first item if at bottom or none selected
            onSelectSession(sessions[0].sessionId);
          } else {
            onSelectSession(sessions[currentIndex + 1].sessionId);
          }
          break;
        }

        case "Enter": {
          event.preventDefault();
          // If nothing selected, select first
          if (!selectedSessionId && sessions.length > 0) {
            onSelectSession(sessions[0].sessionId);
          }
          // Enter on already selected session - could open focus mode in future
          break;
        }

        case "Escape": {
          event.preventDefault();
          onSelectSession(null);
          break;
        }

        // Filter shortcuts (lowercase)
        case "a": {
          if (!event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            onFilterChange("all");
          }
          break;
        }

        case "i": {
          if (!event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            onFilterChange("waiting");
          }
          break;
        }

        case "e": {
          if (!event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            onFilterChange("error");
          }
          break;
        }

        case "s": {
          if (!event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            onFilterChange("stale");
          }
          break;
        }

        case "w": {
          if (!event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            onFilterChange("working");
          }
          break;
        }
      }
    },
    [sessions, selectedSessionId, disabled, onSelectSession, onFilterChange]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
