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
} from "../config/index.js";

/** Max number of output chunks to buffer for replay on reconnect */
const PTY_OUTPUT_BUFFER_SIZE = 5000;
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
    const { sessionId, cwd, command, cols, rows, tabId } = options;

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

    // Build environment with optional tab ID for segment tracking
    const spawnEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    // Inject COMMAND_CENTER_TAB_ID for hook bridge script
    if (tabId) {
      spawnEnv.COMMAND_CENTER_TAB_ID = tabId;
    }

    const proc = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: termCols,
      rows: termRows,
      cwd,
      env: spawnEnv,
    });

    // Capture output during stability check into a temporary buffer
    // This ensures we don't lose initial output (like Claude's history dump)
    const earlyOutputBuffer: string[] = [];
    const earlyDataHandler = proc.onData((data) => {
      earlyOutputBuffer.push(data);
    });

    // Stability check: wait briefly to see if process exits immediately
    // This catches cases where `claude --resume` fails (e.g., session doesn't exist)
    // Using 1 second to catch slow startup failures (claude may take time to check session)
    const STABILITY_CHECK_MS = 1000;

    const exitPromise = new Promise<{ exitCode: number; signal?: number }>((resolve) => {
      proc.onExit(({ exitCode, signal }) => {
        resolve({ exitCode, signal });
      });
    });

    const stabilityResult = await Promise.race([
      exitPromise.then((exit) => ({ type: "exit" as const, ...exit })),
      new Promise<{ type: "stable" }>((resolve) =>
        setTimeout(() => resolve({ type: "stable" }), STABILITY_CHECK_MS)
      ),
    ]);

    // Dispose early handler regardless of outcome
    earlyDataHandler.dispose();

    if (stabilityResult.type === "exit") {
      // Clean up the process
      try {
        proc.kill();
      } catch {
        // Expected: process already exited
      }
      throw new Error(
        `Claude process exited during startup (code=${stabilityResult.exitCode}). ` +
        `Session "${sessionId}" may not be resumable - it may have been compacted or cleared.`
      );
    }

    const session: PtySession = {
      id: ptyId,
      sessionId,
      tabId,
      pid: proc.pid,
      cwd,
      wsToken,
      createdAt: now,
      lastActivityAt: now,
      cols: termCols,
      rows: termRows,
      clients: new Set(),
      outputBuffer: [...earlyOutputBuffer], // Include early output in buffer
    };

    // Store references
    this.sessions.set(ptyId, session);
    this.sessionToPty.set(sessionId, ptyId);
    this.processes.set(ptyId, proc);

    // Handle PTY output - buffer and broadcast to all connected clients
    proc.onData((data) => {
      session.lastActivityAt = new Date().toISOString();

      // Store in circular buffer for replay on reconnect
      session.outputBuffer.push(data);
      if (session.outputBuffer.length > PTY_OUTPUT_BUFFER_SIZE) {
        session.outputBuffer.shift();
      }

      this.broadcast(ptyId, { type: "data", payload: data });
    });

    // Handle PTY exit (for later exits, not initial stability check)
    // Re-register exit handler since the promise consumed the first one
    proc.onExit(() => {
      this.destroyPty(ptyId);
    });

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
   * Replays buffered output to new clients so they see terminal history.
   */
  addClient(ptyId: string, client: WebSocket): boolean {
    const session = this.sessions.get(ptyId);
    if (!session) return false;

    session.clients.add(client);
    session.lastActivityAt = new Date().toISOString();

    // Replay buffered output to new client
    if (session.outputBuffer.length > 0) {
      const historicalData = session.outputBuffer.join("");
      const msg = serializeWsMessage({ type: "data", payload: historicalData });
      client.send(msg);
    }

    return true;
  }

  /**
   * Remove a WebSocket client from a PTY session.
   */
  removeClient(ptyId: string, client: WebSocket): void {
    const session = this.sessions.get(ptyId);
    if (!session) return;

    session.clients.delete(client);
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
        // Expected: client socket may already be closed
      }
    }
    session.clients.clear();

    // Kill the process
    if (proc) {
      try {
        proc.kill();
      } catch {
        // Expected: process may have already exited
      }
    }

    // Clean up maps
    this.sessions.delete(ptyId);
    this.processes.delete(ptyId);
    this.sessionToPty.delete(session.sessionId);

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
