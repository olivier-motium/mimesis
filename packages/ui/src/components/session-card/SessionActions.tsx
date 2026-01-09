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

  // Open embedded terminal (primary action)
  const handleOpenTerminal = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate({
      to: "/session/$sessionId/terminal",
      params: { sessionId: session.sessionId },
    });
  };

  // Kitty: Focus linked terminal
  const handleKittyFocus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.focusSession(session.sessionId);
    } catch (error) {
      console.error("Focus failed:", error);
    } finally {
      setLoading(false);
    }
  };

  // Kitty: Open in new tab
  const handleKittyOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.openSession(session.sessionId);
    } catch (error) {
      console.error("Open failed:", error);
    } finally {
      setLoading(false);
    }
  };

  // Kitty: Link existing terminal
  const handleKittyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.linkTerminal(session.sessionId);
    } catch (error) {
      console.error("Link failed:", error);
    } finally {
      setLoading(false);
    }
  };

  // Kitty: Unlink terminal
  const handleKittyUnlink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await api.unlinkTerminal(session.sessionId);
    } catch (error) {
      console.error("Unlink failed:", error);
    } finally {
      setLoading(false);
    }
  };

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
