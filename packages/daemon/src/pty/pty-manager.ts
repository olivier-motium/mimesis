/**
 * PTY Manager - spawns and manages pseudo-terminal sessions for Claude Code.
 *
 * Responsibilities:
 * - Spawn PTY processes using node-pty
 * - Manage lifecycle (create, destroy, idle timeout)
 * - Token validation for WebSocket auth
 * - Track connected clients per PTY
 * - Broadcast output to all connected clients
 */

import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  PTY_DEFAULT_COLS,
  PTY_DEFAULT_ROWS,
  PTY_IDLE_TIMEOUT_MS,
  PTY_IDLE_CHECK_INTERVAL_MS,
  getPtyWsUrl,
} from "../config.js";
import type {
  PtySession,
  CreatePtyOptions,
  ResizePtyOptions,
  PtyInfo,
} from "./types.js";
import { serializeWsMessage } from "./types.js";

/**
 * Manages PTY sessions for embedded terminals.
 */
export class PtyManager {
  /** Active PTY sessions by PTY ID */
  private sessions = new Map<string, PtySession>();

  /** Map from session ID to PTY ID for quick lookup */
  private sessionToPty = new Map<string, string>();

  /** node-pty process instances */
  private processes = new Map<string, pty.IPty>();

  /** Idle check interval handle */
  private idleCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start idle check interval
    this.idleCheckInterval = setInterval(
      () => this.checkIdleSessions(),
      PTY_IDLE_CHECK_INTERVAL_MS
    );
  }

  /**
   * Create a new PTY session for a Claude Code session.
   */
  async createPty(options: CreatePtyOptions): Promise<PtyInfo> {
    const { sessionId, cwd, command, cols, rows } = options;

    // Check if PTY already exists for this session
    const existingPtyId = this.sessionToPty.get(sessionId);
    if (existingPtyId) {
      const existing = this.sessions.get(existingPtyId);
      if (existing) {
        return this.toPtyInfo(existing);
      }
    }

    const ptyId = randomUUID();
    const wsToken = randomUUID();
    const now = new Date().toISOString();

    const termCols = cols ?? PTY_DEFAULT_COLS;
    const termRows = rows ?? PTY_DEFAULT_ROWS;

    // Spawn the PTY process
    const shell = command[0];
    const args = command.slice(1);

    const proc = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: termCols,
      rows: termRows,
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    const session: PtySession = {
      id: ptyId,
      sessionId,
      pid: proc.pid,
      cwd,
      wsToken,
      createdAt: now,
      lastActivityAt: now,
      cols: termCols,
      rows: termRows,
      clients: new Set(),
    };

    // Store references
    this.sessions.set(ptyId, session);
    this.sessionToPty.set(sessionId, ptyId);
    this.processes.set(ptyId, proc);

    // Handle PTY output - broadcast to all connected clients
    proc.onData((data) => {
      session.lastActivityAt = new Date().toISOString();
      this.broadcast(ptyId, { type: "data", payload: data });
    });

    // Handle PTY exit
    proc.onExit(({ exitCode, signal }) => {
      console.log(
        `[PTY] Process exited: ${ptyId} (code=${exitCode}, signal=${signal})`
      );
      this.destroyPty(ptyId);
    });

    console.log(
      `[PTY] Created session ${ptyId} for ${sessionId} (pid=${proc.pid})`
    );

    return this.toPtyInfo(session);
  }

  /**
   * Get PTY session by PTY ID.
   */
  getPty(ptyId: string): PtySession | undefined {
    return this.sessions.get(ptyId);
  }

  /**
   * Get PTY session by Claude Code session ID.
   */
  getPtyBySessionId(sessionId: string): PtySession | undefined {
    const ptyId = this.sessionToPty.get(sessionId);
    if (!ptyId) return undefined;
    return this.sessions.get(ptyId);
  }

  /**
   * Get PTY info by Claude Code session ID (for API responses).
   */
  getPtyInfoBySessionId(sessionId: string): PtyInfo | null {
    const session = this.getPtyBySessionId(sessionId);
    if (!session) return null;
    return this.toPtyInfo(session);
  }

  /**
   * Resize a PTY session.
   */
  resizePty(ptyId: string, options: ResizePtyOptions): boolean {
    const session = this.sessions.get(ptyId);
    const proc = this.processes.get(ptyId);

    if (!session || !proc) {
      return false;
    }

    const { cols, rows } = options;
    proc.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
    session.lastActivityAt = new Date().toISOString();

    return true;
  }

  /**
   * Write data to a PTY session.
   */
  write(ptyId: string, data: string): boolean {
    const proc = this.processes.get(ptyId);
    const session = this.sessions.get(ptyId);

    if (!proc || !session) {
      return false;
    }

    proc.write(data);
    session.lastActivityAt = new Date().toISOString();
    return true;
  }

  /**
   * Validate a WebSocket token for a PTY session.
   */
  validateToken(ptyId: string, token: string): boolean {
    const session = this.sessions.get(ptyId);
    if (!session) return false;
    return session.wsToken === token;
  }

  /**
   * Add a WebSocket client to a PTY session.
   */
  addClient(ptyId: string, client: WebSocket): boolean {
    const session = this.sessions.get(ptyId);
    if (!session) return false;

    session.clients.add(client);
    session.lastActivityAt = new Date().toISOString();

    console.log(
      `[PTY] Client connected to ${ptyId} (total: ${session.clients.size})`
    );
    return true;
  }

  /**
   * Remove a WebSocket client from a PTY session.
   */
  removeClient(ptyId: string, client: WebSocket): void {
    const session = this.sessions.get(ptyId);
    if (!session) return;

    session.clients.delete(client);
    console.log(
      `[PTY] Client disconnected from ${ptyId} (remaining: ${session.clients.size})`
    );
  }

  /**
   * Destroy a PTY session.
   */
  destroyPty(ptyId: string): boolean {
    const session = this.sessions.get(ptyId);
    const proc = this.processes.get(ptyId);

    if (!session) {
      return false;
    }

    // Close all client connections
    for (const client of session.clients) {
      try {
        client.close(1000, "PTY session ended");
      } catch {
        // Ignore close errors
      }
    }
    session.clients.clear();

    // Kill the process
    if (proc) {
      try {
        proc.kill();
      } catch {
        // Ignore kill errors (process may have already exited)
      }
    }

    // Clean up maps
    this.sessions.delete(ptyId);
    this.processes.delete(ptyId);
    this.sessionToPty.delete(session.sessionId);

    console.log(`[PTY] Destroyed session ${ptyId}`);
    return true;
  }

  /**
   * Destroy PTY by Claude Code session ID.
   */
  destroyPtyBySessionId(sessionId: string): boolean {
    const ptyId = this.sessionToPty.get(sessionId);
    if (!ptyId) return false;
    return this.destroyPty(ptyId);
  }

  /**
   * Destroy all PTY sessions.
   */
  destroyAll(): void {
    for (const ptyId of this.sessions.keys()) {
      this.destroyPty(ptyId);
    }

    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  /**
   * Get all active PTY sessions.
   */
  getAllSessions(): PtySession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Broadcast a message to all clients of a PTY session.
   */
  private broadcast(
    ptyId: string,
    message: { type: string; payload?: string }
  ): void {
    const session = this.sessions.get(ptyId);
    if (!session) return;

    const data = serializeWsMessage(message as Parameters<typeof serializeWsMessage>[0]);

    for (const client of session.clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  /**
   * Check for and destroy idle PTY sessions.
   */
  private checkIdleSessions(): void {
    const now = Date.now();

    for (const [ptyId, session] of this.sessions) {
      // Only destroy if no clients connected and idle for too long
      if (session.clients.size === 0) {
        const lastActivity = new Date(session.lastActivityAt).getTime();
        const idleTime = now - lastActivity;

        if (idleTime > PTY_IDLE_TIMEOUT_MS) {
          console.log(
            `[PTY] Destroying idle session ${ptyId} (idle for ${Math.round(idleTime / 1000)}s)`
          );
          this.destroyPty(ptyId);
        }
      }
    }
  }

  /**
   * Convert internal session to public PTY info.
   */
  private toPtyInfo(session: PtySession): PtyInfo {
    return {
      ptyId: session.id,
      wsUrl: `${getPtyWsUrl()}/pty/${session.id}`,
      wsToken: session.wsToken,
      active: session.clients.size > 0,
      connectedClients: session.clients.size,
    };
  }
}
