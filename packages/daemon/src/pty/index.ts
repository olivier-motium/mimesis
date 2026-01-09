/**
 * PTY module - embedded terminal support for Claude Code sessions.
 *
 * Provides:
 * - PtyManager: spawn and manage PTY processes
 * - WebSocket server: real-time terminal I/O
 * - Types: PtySession, PtyInfo, WsMessage
 */

export { PtyManager } from "./pty-manager.js";
export { createPtyWsServer, closePtyWsServer } from "./ws-server.js";
export type {
  PtySession,
  CreatePtyOptions,
  ResizePtyOptions,
  PtyInfo,
  WsMessage,
} from "./types.js";
export { parseWsMessage, serializeWsMessage } from "./types.js";
