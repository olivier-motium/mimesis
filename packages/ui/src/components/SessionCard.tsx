import { useState } from "react";
import {
  Card,
  Flex,
  Text,
  Code,
  Box,
  HoverCard,
  Badge,
  DropdownMenu,
  IconButton,
} from "@radix-ui/themes";
import { DotsVerticalIcon } from "@radix-ui/react-icons";
import type { Session, CIStatus } from "../data/schema";
import * as api from "../lib/api";
import { SendTextDialog } from "./SendTextDialog";

interface SessionCardProps {
  session: Session;
}

const toolIcons: Record<string, string> = {
  Edit: "✏️",
  Write: "📝",
  Bash: "▶️",
  Read: "📖",
  Grep: "🔍",
  MultiEdit: "✏️",
};

function getCardClass(session: Session): string {
  const classes = ["session-card"];
  if (session.status === "working") {
    classes.push("status-working");
  }
  if (session.status === "waiting" && session.hasPendingToolUse) {
    classes.push("status-needs-approval");
  }
  return classes.join(" ");
}

function formatTimeAgo(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatTarget(target: string): string {
  // Shorten file paths
  if (target.includes("/")) {
    const parts = target.split("/");
    return parts[parts.length - 1];
  }
  // Truncate long commands
  if (target.length > 30) {
    return target.slice(0, 27) + "…";
  }
  return target;
}

function getRoleColor(role: "user" | "assistant" | "tool"): string {
  switch (role) {
    case "user":
      return "var(--blue-11)";
    case "assistant":
      return "var(--gray-12)";
    case "tool":
      return "var(--violet-11)";
  }
}

function getRolePrefix(role: "user" | "assistant" | "tool"): string {
  switch (role) {
    case "user":
      return "You: ";
    case "assistant":
      return "";
    case "tool":
      return "";
  }
}

function getCIStatusIcon(status: CIStatus): string {
  switch (status) {
    case "success":
      return "✓";
    case "failure":
      return "✗";
    case "running":
    case "pending":
      return "◎";
    case "cancelled":
      return "⊘";
    default:
      return "?";
  }
}

function getCIStatusColor(status: CIStatus): "green" | "red" | "yellow" | "gray" {
  switch (status) {
    case "success":
      return "green";
    case "failure":
      return "red";
    case "running":
    case "pending":
      return "yellow";
    default:
      return "gray";
  }
}

interface SessionActionsProps {
  session: Session;
  onSendText?: () => void;
}

/**
 * Session action menu for terminal control
 */
function SessionActions({ session, onSendText }: SessionActionsProps) {
  const [loading, setLoading] = useState(false);

  const handleFocus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.focusSession(session.sessionId);
    } catch (err) {
      console.error("Focus failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.openSession(session.sessionId);
    } catch (err) {
      console.error("Open failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.linkTerminal(session.sessionId);
    } catch (err) {
      console.error("Link failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.unlinkTerminal(session.sessionId);
    } catch (err) {
      console.error("Unlink failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendText = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSendText?.();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <IconButton
          variant="ghost"
          size="1"
          onClick={(e) => e.stopPropagation()}
          disabled={loading}
        >
          <DotsVerticalIcon />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {session.terminalLink ? (
          <>
            <DropdownMenu.Item onClick={handleFocus}>
              Focus terminal
            </DropdownMenu.Item>
            <DropdownMenu.Item onClick={handleSendText}>
              Send message...
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item color="red" onClick={handleUnlink}>
              Unlink terminal
            </DropdownMenu.Item>
          </>
        ) : (
          <>
            <DropdownMenu.Item onClick={handleOpen}>
              Open in kitty
            </DropdownMenu.Item>
            <DropdownMenu.Item onClick={handleLink}>
              Link existing terminal...
            </DropdownMenu.Item>
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

interface SessionCardContentProps {
  session: Session;
  onSendText?: () => void;
}

/**
 * Main card body content
 */
function SessionCardContent({ session, onSendText }: SessionCardContentProps) {
  const { pendingTool } = session;
  const dirPath = session.cwd.replace(/^\/Users\/[^/]+/, "~");

  return (
    <Card size="2" className={getCardClass(session)} style={{ cursor: "pointer" }}>
      <Flex direction="column" gap="2">
        {/* Header: directory, terminal status, time, and actions */}
        <Flex justify="between" align="center">
          <Flex align="center" gap="2">
            <Text size="1" color="gray" style={{ fontFamily: "var(--code-font-family)" }}>
              {dirPath}
            </Text>
            {session.terminalLink && (
              <Badge
                size="1"
                color={session.terminalLink.stale ? "orange" : "green"}
                variant="soft"
              >
                {session.terminalLink.stale ? "stale" : "linked"}
              </Badge>
            )}
          </Flex>
          <Flex align="center" gap="2">
            <Text size="1" color="gray">
              {formatTimeAgo(session.lastActivityAt)}
            </Text>
            <SessionActions session={session} onSendText={onSendText} />
          </Flex>
        </Flex>

        {/* Main content: goal as primary text */}
        <Text size="2" weight="medium" highContrast mb="1">
          {session.goal || session.originalPrompt.slice(0, 50)}
        </Text>

        {/* Secondary: current activity (pending tool or summary) */}
        {pendingTool ? (
          <Flex align="center" gap="2">
            <Text size="1" color="gray">
              {toolIcons[pendingTool.tool]}
            </Text>
            <Code size="1" color="orange" variant="soft">
              {pendingTool.tool}: {formatTarget(pendingTool.target)}
            </Code>
          </Flex>
        ) : (
          <Text size="1" color="gray">
            {session.summary}
          </Text>
        )}

        {/* Footer: branch/PR info and message count */}
        <Flex align="center" justify="between" gap="2">
          <Flex align="center" gap="2">
            {session.pr ? (
              <a
                href={session.pr.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ textDecoration: "none" }}
              >
                <Badge color={getCIStatusColor(session.pr.ciStatus)} variant="soft" size="1">
                  {getCIStatusIcon(session.pr.ciStatus)} #{session.pr.number}
                </Badge>
              </a>
            ) : session.gitBranch ? (
              <Code size="1" variant="soft" color="gray">
                {session.gitBranch.length > 20
                  ? session.gitBranch.slice(0, 17) + "..."
                  : session.gitBranch}
              </Code>
            ) : null}
          </Flex>
          <Text size="1" color="gray">
            {session.messageCount} msgs
          </Text>
        </Flex>
      </Flex>
    </Card>
  );
}

/**
 * Hover panel content with detailed session info
 */
function SessionCardHoverContent({ session }: SessionCardProps) {
  return (
    <Flex direction="column" gap="3" style={{ height: "100%" }}>
      {/* Header: goal */}
      <Text size="2" weight="bold" highContrast>
        {session.goal || session.originalPrompt.slice(0, 60)}
      </Text>

      {/* Recent output */}
      <Box
        p="3"
        flexGrow="1"
        style={{
          backgroundColor: "var(--gray-2)",
          borderRadius: "var(--radius-3)",
          overflow: "auto",
        }}
      >
        {session.recentOutput.length > 0 ? (
          session.recentOutput.map((output, i) => (
            <Text
              key={i}
              as="p"
              size="1"
              mb="2"
              style={{
                color: getRoleColor(output.role),
                whiteSpace: "pre-wrap",
                margin: 0,
                marginBottom: i < session.recentOutput.length - 1 ? "8px" : 0,
              }}
            >
              {getRolePrefix(output.role)}
              {output.content}
            </Text>
          ))
        ) : (
          <Text size="1" color="gray">
            No recent output
          </Text>
        )}
        {session.status === "working" && (
          <Text color="grass" size="1">█</Text>
        )}
      </Box>

      {/* PR Info if available */}
      {session.pr && (
        <Box>
          <Flex align="center" gap="2" mb="2">
            <a
              href={session.pr.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "var(--font-size-1)", fontWeight: 500 }}
            >
              PR #{session.pr.number}: {session.pr.title}
            </a>
          </Flex>
          {session.pr.ciChecks.length > 0 && (
            <Flex gap="2" wrap="wrap">
              {session.pr.ciChecks.map((check) => (
                <Badge
                  key={check.name}
                  color={getCIStatusColor(check.status)}
                  variant="soft"
                  size="1"
                >
                  {getCIStatusIcon(check.status)} {check.name.slice(0, 20)}
                </Badge>
              ))}
            </Flex>
          )}
        </Box>
      )}

      {/* Footer */}
      <Flex justify="between">
        <Text size="1" color="gray">
          {session.cwd.replace(/^\/Users\/\w+\//, "~/")}
        </Text>
        <Text size="1" color="gray">
          {session.sessionId.slice(0, 8)}
        </Text>
      </Flex>
    </Flex>
  );
}

export function SessionCard({ session }: SessionCardProps) {
  const [sendTextOpen, setSendTextOpen] = useState(false);

  return (
    <>
      <HoverCard.Root openDelay={300}>
        <HoverCard.Trigger>
          <SessionCardContent
            session={session}
            onSendText={() => setSendTextOpen(true)}
          />
        </HoverCard.Trigger>
        <HoverCard.Content size="3" style={{ minWidth: "600px", minHeight: "400px" }}>
          <SessionCardHoverContent session={session} />
        </HoverCard.Content>
      </HoverCard.Root>
      <SendTextDialog
        sessionId={session.sessionId}
        open={sendTextOpen}
        onOpenChange={setSendTextOpen}
      />
    </>
  );
}
