/**
 * Command Center - Main dashboard view
 *
 * Displays all sessions in an OpsTable with:
 * - StatusStrip for filtering by status
 * - OpsTable for dense session list
 * - TerminalDock for persistent terminal
 */

import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Flex, Text, Box, Separator } from "@radix-ui/themes";
import { OpsTable, countSessionsByStatus, filterSessions, sortSessions } from "../components/ops-table";
import { StatusStrip } from "../components/StatusStrip";
import { TerminalDock } from "../components/terminal-dock";
import { useSessions } from "../hooks/useSessions";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation";
import type { StatusFilter } from "../components/ops-table/types";

export const Route = createFileRoute("/")({
  component: CommandCenter,
});

function CommandCenter() {
  const { sessions } = useSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  // Calculate status counts for StatusStrip
  const counts = countSessionsByStatus(sessions);

  // Get filtered and sorted sessions (same order as OpsTable)
  const displayedSessions = useMemo(
    () => sortSessions(filterSessions(sessions, filter)),
    [sessions, filter]
  );

  // Get selected session object
  const selectedSession = useMemo(
    () => sessions.find((s) => s.sessionId === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  // Keyboard navigation
  useKeyboardNavigation({
    sessions: displayedSessions,
    selectedSessionId,
    filter,
    onSelectSession: setSelectedSessionId,
    onFilterChange: setFilter,
  });

  // Close terminal dock
  const handleCloseDock = () => {
    setSelectedSessionId(null);
  };

  if (sessions.length === 0) {
    return (
      <Flex direction="column" align="center" gap="3" py="9">
        <Text color="gray" size="3">
          No sessions found
        </Text>
        <Text color="gray" size="2">
          Start a Claude Code session to see it here
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" style={{ height: "calc(100vh - 140px)" }}>
      {/* Status strip - filter badges */}
      <Box pb="3">
        <StatusStrip
          counts={counts}
          activeFilter={filter}
          onFilterChange={setFilter}
        />
      </Box>

      <Separator size="4" />

      {/* Ops Table - takes remaining space */}
      <Box style={{ flex: 1, minHeight: 0, marginTop: "var(--space-3)" }}>
        <OpsTable
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={setSelectedSessionId}
          filter={filter}
          onFilterChange={setFilter}
        />
      </Box>

      {/* Terminal Dock - persistent terminal for selected session */}
      {selectedSession && (
        <>
          <Separator size="4" my="3" />
          <TerminalDock session={selectedSession} onClose={handleCloseDock} />
        </>
      )}
    </Flex>
  );
}
