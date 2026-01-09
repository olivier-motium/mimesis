/**
 * SessionHeader - Header bar for the TerminalDock
 *
 * Shows:
 * - Session goal/status
 * - Branch info
 * - Terminal status
 * - Close button
 */

import { Flex, Text, Code, Badge, IconButton } from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import type { Session } from "../../types/schema";

interface SessionHeaderProps {
  session: Session;
  isConnected: boolean;
  isLoading: boolean;
  onClose: () => void;
}

const STATUS_COLORS = {
  working: "green",
  waiting: "orange",
  idle: "gray",
} as const;

export function SessionHeader({
  session,
  isConnected,
  isLoading,
  onClose,
}: SessionHeaderProps) {
  const { status } = getEffectiveStatus(session);
  const goalText = session.goal || session.originalPrompt.slice(0, 50);

  return (
    <Flex
      className="terminal-dock-header"
      align="center"
      justify="between"
      gap="3"
    >
      <Flex align="center" gap="3" style={{ flex: 1, minWidth: 0 }}>
        {/* Status badge */}
        <Badge color={STATUS_COLORS[status]} variant="soft" size="1">
          {status === "working" ? "Working" : status === "waiting" ? "Waiting" : "Idle"}
        </Badge>

        {/* Goal text */}
        <Text size="2" weight="medium" truncate style={{ flex: 1 }}>
          {goalText}
        </Text>

        {/* Branch */}
        {session.gitBranch && (
          <Code size="1" variant="soft" color="gray">
            {session.gitBranch.length > 20
              ? session.gitBranch.slice(0, 17) + "..."
              : session.gitBranch}
          </Code>
        )}

        {/* Connection status */}
        <Badge
          color={isLoading ? "yellow" : isConnected ? "green" : "red"}
          variant="soft"
          size="1"
        >
          {isLoading ? "Connecting..." : isConnected ? "Connected" : "Disconnected"}
        </Badge>
      </Flex>

      {/* Close button */}
      <IconButton
        variant="ghost"
        size="1"
        color="gray"
        onClick={onClose}
        title="Close terminal"
      >
        <Cross2Icon />
      </IconButton>
    </Flex>
  );
}
