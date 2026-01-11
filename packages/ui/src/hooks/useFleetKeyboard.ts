/**
 * useFleetKeyboard - Keyboard navigation for Fleet Command.
 *
 * Handles:
 * - Arrow up/down for session navigation
 * - Escape to deselect or close commander
 * - Ctrl/Cmd+Tab to toggle commander view
 * - Filter shortcuts (a, w, i)
 */

import { useEffect, useCallback } from "react";
import type { StatusFilter } from "../components/ops-table/types";

export interface UseFleetKeyboardOptions {
  /** Sessions list for navigation */
  sessions: Array<{ sessionId: string; workChainId?: string | null }>;
  /** Currently selected session ID */
  selectedSessionId: string | null;
  /** Callback to select a session */
  onSelectSession: (sessionId: string) => void;
  /** Callback to deselect session */
  onDeselectSession: () => void;
  /** Whether commander view is shown */
  showCommander: boolean;
  /** Callback to toggle commander view */
  onToggleCommander: () => void;
  /** Callback to close commander view */
  onCloseCommander: () => void;
  /** Callback to change filter */
  onFilterChange: (filter: StatusFilter) => void;
}

/**
 * Get the chain ID (workChainId or sessionId) for a session.
 */
function getChainId(session: { sessionId: string; workChainId?: string | null }): string {
  return session.workChainId ?? session.sessionId;
}

export function useFleetKeyboard(options: UseFleetKeyboardOptions): void {
  const {
    sessions,
    selectedSessionId,
    onSelectSession,
    onDeselectSession,
    showCommander,
    onToggleCommander,
    onCloseCommander,
    onFilterChange,
  } = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const currentIndex = sessions.findIndex(
        (s) => getChainId(s) === selectedSessionId
      );

      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          if (sessions.length === 0) return;
          if (currentIndex <= 0) {
            onSelectSession(getChainId(sessions[sessions.length - 1]));
          } else {
            onSelectSession(getChainId(sessions[currentIndex - 1]));
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          if (sessions.length === 0) return;
          if (currentIndex < 0 || currentIndex >= sessions.length - 1) {
            onSelectSession(getChainId(sessions[0]));
          } else {
            onSelectSession(getChainId(sessions[currentIndex + 1]));
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          if (showCommander) {
            onCloseCommander();
          } else {
            onDeselectSession();
          }
          break;
        }
        case "Tab": {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onToggleCommander();
          }
          break;
        }
        // Filter shortcuts
        case "a":
        case "A":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onFilterChange("all");
          }
          break;
        case "w":
        case "W":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onFilterChange("working");
          }
          break;
        case "i":
        case "I":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onFilterChange("waiting");
          }
          break;
      }
    },
    [
      sessions,
      selectedSessionId,
      showCommander,
      onSelectSession,
      onDeselectSession,
      onToggleCommander,
      onCloseCommander,
      onFilterChange,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
