/**
 * FleetCommand - Fleet Commander v5 Layout
 *
 * 3-column layout (Melty-style):
 * - Left: Roster (session list with spawn button)
 * - Center: Timeline (structured events) + SessionInput
 * - Right: TacticalIntel (status, file changes)
 *
 * Connects to Fleet Gateway via WebSocket for realtime updates.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { CommandBar } from "./CommandBar";
import { Roster } from "./Roster";
import { TacticalIntel } from "./TacticalIntel";
import { Timeline } from "../timeline/Timeline";
import { SessionInput } from "../session-input/SessionInput";
import { CommanderTab } from "../commander/CommanderTab";
import { StatusStrip } from "../StatusStrip";
import { countSessionsByStatus } from "../ops-table/utils";
import { useGateway } from "../../hooks/useGateway";
import { useSessionEvents } from "../../hooks/useSessionEvents";
import type { FleetCommandProps, ViewMode } from "./types";
import type { StatusFilter } from "../ops-table/types";
import { cn } from "../../lib/utils";

// ============================================================================
// Component
// ============================================================================

export function FleetCommand({ sessions }: FleetCommandProps) {
  const gateway = useGateway();
  const sessionEvents = useSessionEvents(gateway);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>("focus");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showCommander, setShowCommander] = useState(false);

  // Count sessions by status for StatusStrip
  const statusCounts = useMemo(
    () => countSessionsByStatus(sessions),
    [sessions]
  );

  // Get selected session
  const selectedSession = useMemo(
    () => sessions.find((s) => (s.workChainId ?? s.sessionId) === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  // Get session status from gateway or fallback to durable streams data
  const activeSessionStatus = useMemo(() => {
    if (!selectedSessionId) return "idle";
    const gatewaySession = gateway.sessions.get(selectedSessionId);
    if (gatewaySession) return gatewaySession.status;
    return selectedSession?.status.status ?? "idle";
  }, [selectedSessionId, gateway.sessions, selectedSession]);

  // Handle session selection - attach to gateway
  const handleSelectSession = useCallback((sessionId: string) => {
    // Detach from previous session
    if (gateway.attachedSession && gateway.attachedSession !== sessionId) {
      gateway.detachSession(gateway.attachedSession);
    }

    setSelectedSessionId(sessionId);

    // Attach to new session (request events from seq 0 for full history)
    gateway.attachSession(sessionId, 0);
  }, [gateway]);

  // Handle send stdin
  const handleSendStdin = useCallback((sessionId: string, data: string) => {
    gateway.sendStdin(sessionId, data);
  }, [gateway]);

  // Handle send signal
  const handleSendSignal = useCallback((sessionId: string, signal: "SIGINT" | "SIGTERM" | "SIGKILL") => {
    gateway.sendSignal(sessionId, signal);
  }, [gateway]);

  // Handle Commander job creation
  const handleCreateCommanderJob = useCallback((prompt: string) => {
    gateway.createJob({
      type: "commander_turn",
      model: "opus",
      request: {
        prompt,
        maxTurns: 1,
        disallowedTools: ["Bash", "Edit", "Write", "TodoWrite"],
      },
    });
  }, [gateway]);

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

      const getChainId = (s: typeof sessions[0]) => s.workChainId ?? s.sessionId;
      const currentIndex = sessions.findIndex(
        (s) => getChainId(s) === selectedSessionId
      );

      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          if (sessions.length === 0) return;
          if (currentIndex <= 0) {
            handleSelectSession(getChainId(sessions[sessions.length - 1]));
          } else {
            handleSelectSession(getChainId(sessions[currentIndex - 1]));
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          if (sessions.length === 0) return;
          if (currentIndex < 0 || currentIndex >= sessions.length - 1) {
            handleSelectSession(getChainId(sessions[0]));
          } else {
            handleSelectSession(getChainId(sessions[currentIndex + 1]));
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          if (showCommander) {
            setShowCommander(false);
          } else {
            setSelectedSessionId(null);
          }
          break;
        }
        // Tab toggle
        case "Tab": {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setShowCommander((prev) => !prev);
          }
          break;
        }
        // Filter shortcuts
        case "a":
        case "A":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setFilter("all");
          }
          break;
        case "w":
        case "W":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setFilter("working");
          }
          break;
        case "i":
        case "I":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setFilter("waiting");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sessions, selectedSessionId, showCommander, handleSelectSession]);

  return (
    <div className="fleet-command fleet-command--focus">
      {/* Header */}
      <CommandBar
        sessionCount={sessions.length}
        workingCount={statusCounts.working}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedSession={selectedSession}
        onBackToOps={() => setShowCommander(false)}
        gatewayStatus={gateway.status}
        onToggleCommander={() => setShowCommander((prev) => !prev)}
        showCommander={showCommander}
      />

      {/* StatusStrip */}
      <div className="fleet-filters">
        <StatusStrip
          counts={statusCounts}
          activeFilter={filter}
          onFilterChange={setFilter}
        />
      </div>

      {/* Left: Roster */}
      <Roster
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={handleSelectSession}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        compact={false}
      />

      {/* Center: Timeline or Commander */}
      <div className="fleet-center flex flex-col h-full">
        {showCommander ? (
          <CommanderTab
            activeJob={gateway.activeJob}
            onCreateJob={handleCreateCommanderJob}
            onCancelJob={gateway.cancelJob}
          />
        ) : (
          <>
            {/* Timeline */}
            <Timeline
              events={sessionEvents.events}
              isScrolledAway={sessionEvents.isScrolledAway}
              onScrolledAwayChange={sessionEvents.setScrolledAway}
              className="flex-1"
            />

            {/* Session Input */}
            <SessionInput
              sessionId={selectedSessionId}
              sessionStatus={activeSessionStatus}
              onSendStdin={handleSendStdin}
              onSendSignal={handleSendSignal}
            />
          </>
        )}
      </div>

      {/* Right: Tactical Intel */}
      <TacticalIntel
        session={selectedSession}
        fleetEvents={gateway.fleetEvents}
        gatewayStatus={gateway.status}
      />
    </div>
  );
}
