/**
 * WebSocket server for PTY terminal I/O.
 *
 * Handles:
 * - WebSocket upgrade at /pty/:ptyId?token=<wsToken>
 * - Token validation
 * - Input relay from client to PTY
 * - Resize events
 * - Keep-alive ping/pong
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { PTY_WS_HOST, PTY_WS_PORT } from "../config.js";
import type { PtyManager } from "./pty-manager.js";
import { parseWsMessage, serializeWsMessage } from "./types.js";

export interface PtyWsServerOptions {
  /** PTY manager instance */
  ptyManager: PtyManager;
  /** Host to bind to (default: 127.0.0.1) */
  host?: string;
  /** Port to listen on (default: 4452) */
  port?: number;
}

/**
 * Create and start the PTY WebSocket server.
 */
export function createPtyWsServer(options: PtyWsServerOptions): WebSocketServer {
  const { ptyManager, host = PTY_WS_HOST, port = PTY_WS_PORT } = options;

  const wss = new WebSocketServer({
    host,
    port,
    // Note: Don't use `path` option as it only matches exact paths.
    // We handle path validation in the connection handler instead.
  });

  console.log(`[PTY WS] Server listening on ws://${host}:${port}/pty`);

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);

    // Extract PTY ID from path: /pty/:ptyId
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2 || pathParts[0] !== "pty") {
      console.log("[PTY WS] Invalid path:", url.pathname);
      ws.close(4000, "Invalid path");
      return;
    }

    const ptyId = pathParts[1];
    const token = url.searchParams.get("token");

    if (!token) {
      console.log("[PTY WS] Missing token");
      ws.close(4001, "Missing token");
      return;
    }

    // Validate token
    if (!ptyManager.validateToken(ptyId, token)) {
      console.log("[PTY WS] Invalid token for PTY:", ptyId);
      ws.close(4003, "Invalid token");
      return;
    }

    // Add client to PTY session
    if (!ptyManager.addClient(ptyId, ws)) {
      console.log("[PTY WS] PTY session not found:", ptyId);
      ws.close(4004, "PTY session not found");
      return;
    }

    // Handle messages from client
    ws.on("message", (data: Buffer | string) => {
      const message = parseWsMessage(data.toString());
      if (!message) {
        console.log("[PTY WS] Invalid message format");
        return;
      }

      switch (message.type) {
        case "input":
          // Send input to PTY
          ptyManager.write(ptyId, message.payload);
          break;

        case "resize":
          // Resize PTY
          if (
            typeof message.cols === "number" &&
            typeof message.rows === "number"
          ) {
            ptyManager.resizePty(ptyId, {
              cols: message.cols,
              rows: message.rows,
            });
          }
          break;

        case "ping":
          // Respond with pong
          ws.send(serializeWsMessage({ type: "pong" }));
          break;

        default:
          // Unknown message type, ignore
          break;
      }
    });

    // Handle client disconnect
    ws.on("close", () => {
      ptyManager.removeClient(ptyId, ws);
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error("[PTY WS] Client error:", error.message);
      ptyManager.removeClient(ptyId, ws);
    });
  });

  wss.on("error", (error) => {
    console.error("[PTY WS] Server error:", error);
  });

  return wss;
}

/**
 * Close the WebSocket server gracefully.
 */
export function closePtyWsServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    // Close all client connections
    for (const client of wss.clients) {
      client.close(1001, "Server shutting down");
    }

    wss.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log("[PTY WS] Server closed");
        resolve();
      }
    });
  });
}
