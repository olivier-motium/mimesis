/**
 * AgentCommand - Agent-Focused Layout
 *
 * 3-zone grid layout:
 * - Left: ProjectNavigator (projects with agent "tabs")
 * - Center: TerminalView (selected agent's terminal)
 * - Right: LiveStatePanel (status + recent output)
 *
 * Selection happens in the sidebar - no tab bar above terminal.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { ProjectNavigator } from "./ProjectNavigator";
import { TerminalView } from "./TerminalView";
import { LiveStatePanel } from "./LiveStatePanel";
import type { AgentCommandProps } from "./types";

export function AgentCommand({ sessions }: AgentCommandProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Count active agents for header
  const workingCount = useMemo(
    () => sessions.filter((s) => s.status === "working").length,
    [sessions]
  );

  // Get selected session by workChainId (handles compaction)
  const selectedSession = useMemo(
    () =>
      sessions.find((s) => (s.workChainId ?? s.sessionId) === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  // Handle session selection
  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const getChainId = (s: (typeof sessions)[0]) => s.workChainId ?? s.sessionId;
      const currentIndex = sessions.findIndex(
        (s) => getChainId(s) === selectedSessionId
      );

      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          if (sessions.length === 0) return;
          if (currentIndex <= 0) {
            setSelectedSessionId(getChainId(sessions[sessions.length - 1]));
          } else {
            setSelectedSessionId(getChainId(sessions[currentIndex - 1]));
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          if (sessions.length === 0) return;
          if (currentIndex < 0 || currentIndex >= sessions.length - 1) {
            setSelectedSessionId(getChainId(sessions[0]));
          } else {
            setSelectedSessionId(getChainId(sessions[currentIndex + 1]));
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setSelectedSessionId(null);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sessions, selectedSessionId]);

  return (
    <div className="agent-command">
      {/* Header */}
      <header className="agent-command__header">
        <div className="agent-command__logo">MIMESIS</div>
        <div className="agent-command__status">
          <span className="agent-command__online-dot" />
          <span className="agent-command__status-text">ONLINE</span>
        </div>
        <div className="agent-command__agents">
          AGENTS: {workingCount}/{sessions.length} Active
        </div>
      </header>

      {/* Left: Project Navigator */}
      <ProjectNavigator
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={handleSelectSession}
      />

      {/* Center: Terminal View */}
      <TerminalView session={selectedSession} />

      {/* Right: Live State Panel */}
      <LiveStatePanel session={selectedSession} />
    </div>
  );
}
