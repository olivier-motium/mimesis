/**
 * Session action menu for terminal control
 *
 * Provides unified access to:
 * - Embedded terminal (primary)
 * - Kitty terminal (secondary submenu)
 * - Send message (works for both)
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DropdownMenu, IconButton } from "@radix-ui/themes";
import { DotsVerticalIcon } from "@radix-ui/react-icons";
import * as api from "../../lib/api";
import type { SessionActionsProps } from "./types";

export function SessionActions({ session, onSendText }: SessionActionsProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  /**
   * Factory for async action handlers.
   * Wraps an async action with stopPropagation, loading state, and error logging.
   */
  const createAsyncHandler = (
    action: () => Promise<void>,
    actionName: string
  ) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await action();
    } catch (error) {
      console.error(`${actionName} failed:`, error);
    } finally {
      setLoading(false);
    }
  };

  // Open embedded terminal (primary action)
  const handleOpenTerminal = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate({
      to: "/session/$sessionId/terminal",
      params: { sessionId: session.sessionId },
    });
  };

  // Kitty actions
  const handleKittyFocus = createAsyncHandler(
    () => api.focusSession(session.sessionId),
    "Focus"
  );
  const handleKittyOpen = createAsyncHandler(
    () => api.openSession(session.sessionId),
    "Open"
  );
  const handleKittyLink = createAsyncHandler(
    () => api.linkTerminal(session.sessionId),
    "Link"
  );
  const handleKittyUnlink = createAsyncHandler(
    () => api.unlinkTerminal(session.sessionId),
    "Unlink"
  );

  // Send text (works for both embedded and kitty)
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
      <DropdownMenu.Content onClick={(e) => e.stopPropagation()}>
        {/* Primary: Open embedded terminal */}
        <DropdownMenu.Item onClick={handleOpenTerminal}>
          Open terminal
        </DropdownMenu.Item>

        {/* Kitty submenu */}
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger>Kitty...</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            {session.terminalLink ? (
              <>
                <DropdownMenu.Item onClick={handleKittyFocus}>
                  Focus kitty window
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item color="red" onClick={handleKittyUnlink}>
                  Unlink kitty
                </DropdownMenu.Item>
              </>
            ) : (
              <>
                <DropdownMenu.Item onClick={handleKittyOpen}>
                  Open in kitty
                </DropdownMenu.Item>
                <DropdownMenu.Item onClick={handleKittyLink}>
                  Link existing kitty window...
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>

        {/* Send text - works for both */}
        <DropdownMenu.Separator />
        <DropdownMenu.Item onClick={handleSendText}>
          Send message...
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
