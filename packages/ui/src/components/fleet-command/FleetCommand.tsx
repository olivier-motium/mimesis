/**
 * FleetCommand - Main container for the operator console
 *
 * 4-zone layout:
 * - Zone A (Left): Roster - agent list
 * - Zone B (Center): Viewport - terminal
 * - Zone C (Right): Tactical Intel - plan + artifacts
 * - Zone D (Bottom): Event Ticker - global events
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CommandBar } from "./CommandBar";
import { Roster } from "./Roster";
import { Viewport } from "./Viewport";
import { TacticalIntel } from "./TacticalIntel";
import { EventTicker } from "./EventTicker";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import { getAgentName } from "./constants";
import type { FleetCommandProps, AgentEvent } from "./types";
import type { Session } from "../../types/schema";

/** Generate event from status change */
function generateStatusEvent(
  session: Session,
  prevStatus: string | null
): AgentEvent | null {
  const { status, fileStatusValue } = getEffectiveStatus(session);

  // Only generate events for meaningful changes
  if (prevStatus === status) return null;

  let message = "";
  let type: AgentEvent["type"] = "status_change";

  if (fileStatusValue === "error") {
    type = "error";
    message = "encountered an error";
  } else if (status === "waiting") {
    type = "waiting";
    message = "requires input";
  } else if (status === "working" && prevStatus === "idle") {
    type = "started";
    message = "started working";
  } else if (status === "idle" && prevStatus === "working") {
    type = "completed";
    message = "finished task";
  } else {
    return null; // Skip uninteresting transitions
  }

  return {
    id: `${session.sessionId}-${Date.now()}`,
    timestamp: new Date(),
    sessionId: session.sessionId,
    sessionName: getAgentName(session),
    type,
    message,
  };
}

export function FleetCommand({ sessions }: FleetCommandProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>([]);

  // Track previous session statuses for event detection
  const prevStatusesRef = useRef<Map<string, string>>(new Map());

  // Detect status changes and generate events
  useEffect(() => {
    const newEvents: AgentEvent[] = [];

    sessions.forEach((session) => {
      const { status } = getEffectiveStatus(session);
      const prevStatus = prevStatusesRef.current.get(session.sessionId) ?? null;

      const event = generateStatusEvent(session, prevStatus);
      if (event) {
        newEvents.push(event);
      }

      prevStatusesRef.current.set(session.sessionId, status);
    });

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, 50)); // Keep last 50 events
    }
  }, [sessions]);

  // Count active sessions
  const workingCount = useMemo(
    () => sessions.filter((s) => getEffectiveStatus(s).status === "working").length,
    [sessions]
  );

  // Get selected session object
  const selectedSession = useMemo(
    () => sessions.find((s) => s.sessionId === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  // Handle command sent
  const handleSendCommand = useCallback((text: string) => {
    // Could add event to ticker here
    console.log("[FleetCommand] Command sent:", text);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Find current index
      const currentIndex = sessions.findIndex(
        (s) => s.sessionId === selectedSessionId
      );

      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          if (sessions.length === 0) return;
          if (currentIndex <= 0) {
            setSelectedSessionId(sessions[sessions.length - 1].sessionId);
          } else {
            setSelectedSessionId(sessions[currentIndex - 1].sessionId);
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          if (sessions.length === 0) return;
          if (currentIndex < 0 || currentIndex >= sessions.length - 1) {
            setSelectedSessionId(sessions[0].sessionId);
          } else {
            setSelectedSessionId(sessions[currentIndex + 1].sessionId);
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
    <div className="fleet-command">
      <CommandBar sessionCount={sessions.length} workingCount={workingCount} />

      <Roster
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <Viewport session={selectedSession} onSendCommand={handleSendCommand} />

      <TacticalIntel session={selectedSession} />

      <EventTicker events={events} />
    </div>
  );
}
