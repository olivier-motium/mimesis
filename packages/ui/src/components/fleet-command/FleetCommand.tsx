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

import { useState, useCallback } from "react";
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
import { useFleetKeyboard } from "../../hooks/useFleetKeyboard";
import type { FleetCommandProps } from "./types";
import type { StatusFilter } from "../ops-table/types";

// ============================================================================
// Component
// ============================================================================

export function FleetCommand({ sessions }: FleetCommandProps) {
  const gateway = useGateway();
  const sessionEvents = useSessionEvents(gateway);

  // UI state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showCommander, setShowCommander] = useState(false);

  // Count sessions by status for StatusStrip
  const statusCounts = countSessionsByStatus(sessions);

  // Get selected session
  const selectedSession = sessions.find((s) => (s.workChainId ?? s.sessionId) === selectedSessionId) ?? null;

  // Get session status from gateway or fallback to durable streams data
  const activeSessionStatus = (() => {
    if (!selectedSessionId) return "idle";
    const gatewaySession = gateway.sessions.get(selectedSessionId);
    if (gatewaySession) return gatewaySession.status;
    return selectedSession?.status.status ?? "idle";
  })();

  // Handle session selection - attach to gateway
  const handleSelectSession = useCallback((sessionId: string) => {
    // Detach from previous session
    if (gateway.attachedSession && gateway.attachedSession !== sessionId) {
      gateway.detachSession(gateway.attachedSession);
    }

    // Clear events for this session before re-attaching (prevents duplicates)
    gateway.clearSessionEvents(sessionId);

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

  // Handle Commander prompt (uses PTY-based conversation via gateway)
  const handleCommanderPrompt = useCallback((prompt: string) => {
    gateway.sendCommanderPrompt(prompt);
  }, [gateway]);

  // Handle Commander cancel (sends SIGINT)
  const handleCancelCommander = useCallback(() => {
    gateway.cancelCommander();
  }, [gateway]);

  // Handle Commander reset (kills PTY, starts fresh)
  const handleResetCommander = useCallback(() => {
    gateway.resetCommander();
  }, [gateway]);

  // Keyboard navigation (extracted to hook)
  useFleetKeyboard({
    sessions,
    selectedSessionId,
    onSelectSession: handleSelectSession,
    onDeselectSession: () => setSelectedSessionId(null),
    showCommander,
    onToggleCommander: () => setShowCommander((prev) => !prev),
    onCloseCommander: () => setShowCommander(false),
    onFilterChange: setFilter,
  });

  return (
    <div className="fleet-command">
      {/* Header */}
      <CommandBar
        sessionCount={sessions.length}
        workingCount={statusCounts.working}
        selectedSession={selectedSession}
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
      <div className="fleet-viewport flex flex-col h-full">
        {showCommander ? (
          <CommanderTab
            commanderState={gateway.commanderState}
            onSendPrompt={handleCommanderPrompt}
            onCancel={handleCancelCommander}
            onResetConversation={handleResetCommander}
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
