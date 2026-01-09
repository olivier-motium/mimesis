/**
 * Fullscreen terminal route for embedded Claude Code sessions.
 *
 * Route: /session/:sessionId/terminal
 *
 * Renders a fullscreen terminal overlay with header showing
 * session info and close button.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useCallback } from "react";
import { Box, Flex, Text, Badge, IconButton, Spinner } from "@radix-ui/themes";
import { Cross2Icon, ArrowLeftIcon } from "@radix-ui/react-icons";
import { Terminal } from "../components/terminal";
import { usePtySession } from "../hooks/usePtySession";
import { useSessions } from "../hooks/useSessions";

export const Route = createFileRoute("/session/$sessionId/terminal")({
  component: TerminalPage,
});

function TerminalPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const { sessions } = useSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);

  const { ptyInfo, isLoading, error, createPtySession } =
    usePtySession(sessionId);

  // Auto-create PTY if none exists
  useEffect(() => {
    if (!ptyInfo && !isLoading && !error) {
      createPtySession();
    }
  }, [ptyInfo, isLoading, error, createPtySession]);

  const handleClose = useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  const statusColor =
    session?.status === "working"
      ? "green"
      : session?.status === "waiting"
        ? "yellow"
        : "gray";

  // Get directory name for display
  const dirName = session?.cwd.split("/").pop() || "Terminal";

  return (
    <Box
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "var(--gray-1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <Flex
        justify="between"
        align="center"
        px="4"
        py="3"
        style={{
          borderBottom: "1px solid var(--gray-a5)",
          backgroundColor: "var(--gray-2)",
          flexShrink: 0,
        }}
      >
        <Flex align="center" gap="3">
          <IconButton
            variant="ghost"
            color="gray"
            onClick={handleClose}
            title="Back to dashboard"
          >
            <ArrowLeftIcon width="18" height="18" />
          </IconButton>

          <Flex direction="column" gap="1">
            <Flex align="center" gap="2">
              <Text size="3" weight="medium">
                {session?.goal || dirName}
              </Text>
              {session && (
                <Badge color={statusColor} size="1">
                  {session.status}
                </Badge>
              )}
            </Flex>
            <Text size="1" color="gray">
              {session?.cwd.replace(/^\/Users\/[^/]+/, "~") || sessionId}
            </Text>
          </Flex>
        </Flex>

        <Flex align="center" gap="2">
          <Text size="1" color="gray">
            Press Esc to close
          </Text>
          <IconButton variant="ghost" color="gray" onClick={handleClose}>
            <Cross2Icon width="18" height="18" />
          </IconButton>
        </Flex>
      </Flex>

      {/* Terminal area */}
      <Box style={{ flex: 1, overflow: "hidden" }}>
        {isLoading && (
          <Flex align="center" justify="center" style={{ height: "100%" }}>
            <Flex direction="column" align="center" gap="3">
              <Spinner size="3" />
              <Text color="gray">Connecting to terminal...</Text>
            </Flex>
          </Flex>
        )}

        {error && (
          <Flex align="center" justify="center" style={{ height: "100%" }}>
            <Flex direction="column" align="center" gap="3">
              <Text color="red" size="3">
                {error}
              </Text>
              <Text color="gray" size="2">
                Make sure the daemon is running and try again.
              </Text>
            </Flex>
          </Flex>
        )}

        {ptyInfo && (
          <Terminal
            wsUrl={ptyInfo.wsUrl}
            wsToken={ptyInfo.wsToken}
            onDisconnect={handleClose}
            onError={(err) => console.error("[Terminal] Error:", err)}
          />
        )}
      </Box>
    </Box>
  );
}
