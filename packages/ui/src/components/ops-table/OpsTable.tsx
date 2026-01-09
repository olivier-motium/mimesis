/**
 * OpsTable - Dense list of sessions replacing Kanban cards
 *
 * Displays all sessions in a scannable table format with:
 * - Status icon
 * - Goal/prompt
 * - Branch/PR info
 * - Pending tool
 * - Activity time
 * - Repository
 * - Actions menu
 */

import { Flex, Box, Text, ScrollArea } from "@radix-ui/themes";
import { OpsTableRow } from "./OpsTableRow";
import { filterSessions, sortSessions } from "./utils";
import type { OpsTableProps } from "./types";

export function OpsTable({
  sessions,
  selectedSessionId,
  onSelectSession,
  filter,
}: OpsTableProps) {
  // Filter and sort sessions
  const filteredSessions = filterSessions(sessions, filter);
  const sortedSessions = sortSessions(filteredSessions);

  if (sortedSessions.length === 0) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        py="6"
        style={{ color: "var(--gray-11)" }}
      >
        <Text size="2">
          {filter === "all"
            ? "No sessions found"
            : `No ${filter} sessions`}
        </Text>
      </Flex>
    );
  }

  return (
    <Box style={{ flex: 1, minHeight: 0 }}>
      {/* Table header */}
      <Box
        style={{
          padding: "var(--space-2) var(--space-3)",
          borderBottom: "1px solid var(--gray-a6)",
          backgroundColor: "var(--gray-a2)",
        }}
      >
        <Flex align="center" gap="3">
          <Box style={{ width: "24px" }}>
            <Text size="1" color="gray" weight="medium">●</Text>
          </Box>
          <Box style={{ flex: 1 }}>
            <Text size="1" color="gray" weight="medium">Goal</Text>
          </Box>
          <Box style={{ width: "100px" }}>
            <Text size="1" color="gray" weight="medium">Branch</Text>
          </Box>
          <Box style={{ width: "80px" }}>
            <Text size="1" color="gray" weight="medium">Tool</Text>
          </Box>
          <Box style={{ width: "50px", textAlign: "right" }}>
            <Text size="1" color="gray" weight="medium">Age</Text>
          </Box>
          <Box style={{ width: "80px" }}>
            <Text size="1" color="gray" weight="medium">Repo</Text>
          </Box>
          <Box style={{ width: "32px" }} />
        </Flex>
      </Box>

      {/* Table body - scrollable */}
      <ScrollArea style={{ height: "100%" }}>
        {sortedSessions.map((session) => (
          <OpsTableRow
            key={session.sessionId}
            session={session}
            isSelected={session.sessionId === selectedSessionId}
            onSelect={() => onSelectSession(session.sessionId)}
          />
        ))}
      </ScrollArea>
    </Box>
  );
}
