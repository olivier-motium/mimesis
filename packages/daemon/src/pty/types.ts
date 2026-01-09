/**
 * Type definitions for the PTY (embedded terminal) module.
 */

import type { WebSocket } from "ws";

/**
 * Represents an active PTY session.
 */
export interface PtySession {
  /** Unique PTY identifier (UUID) */
  id: string;
  /** Claude Code session ID this PTY is attached to */
  sessionId: string;
  /** Stable tab ID for segment tracking (injected as COMMAND_CENTER_TAB_ID) */
  tabId?: string;
  /** PTY process PID */
  pid: number;
  /** Working directory */
  cwd: string;
  /** Authentication token for WebSocket connections */
  wsToken: string;
  /** ISO timestamp when PTY was created */
  createdAt: string;
  /** ISO timestamp of last activity */
  lastActivityAt: string;
  /** Terminal columns */
  cols: number;
  /** Terminal rows */
  rows: number;
  /** Connected WebSocket clients */
  clients: Set<WebSocket>;
}

/**
 * Options for creating a new PTY session.
 */
export interface CreatePtyOptions {
  /** Claude Code session ID */
  sessionId: string;
  /** Working directory for the PTY */
  cwd: string;
  /** Command and arguments to spawn (e.g., ["claude", "--resume", "abc123"]) */
  command: string[];
  /** Terminal columns (optional, uses default if not provided) */
  cols?: number;
  /** Terminal rows (optional, uses default if not provided) */
  rows?: number;
  /** Stable tab ID for segment tracking (injected as COMMAND_CENTER_TAB_ID) */
  tabId?: string;
}

/**
 * Options for resizing a PTY.
 */
export interface ResizePtyOptions {
  /** New terminal columns */
  cols: number;
  /** New terminal rows */
  rows: number;
}

/**
 * PTY info returned to clients (excludes internal details).
 */
export interface PtyInfo {
  /** PTY identifier */
  ptyId: string;
  /** WebSocket URL for connecting */
  wsUrl: string;
  /** Authentication token */
  wsToken: string;
  /** Whether there are active client connections */
  active: boolean;
  /** Number of connected clients */
  connectedClients: number;
}

/**
 * WebSocket message types for terminal I/O.
 */
export type WsMessage =
  | { type: "data"; payload: string }
  | { type: "input"; payload: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "ping" }
  | { type: "pong" };

/**
 * Parse a WebSocket message from JSON string.
 */
export function parseWsMessage(data: string): WsMessage | null {
  try {
    const msg = JSON.parse(data);
    if (
      typeof msg === "object" &&
      msg !== null &&
      typeof msg.type === "string"
    ) {
      return msg as WsMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Serialize a WebSocket message to JSON string.
 */
export function serializeWsMessage(msg: WsMessage): string {
  return JSON.stringify(msg);
}
