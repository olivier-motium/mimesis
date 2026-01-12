/**
 * PTY Bridge - Spawns and manages pseudo-terminal sessions for Claude Code.
 *
 * This module replaces the old pty/pty-manager.ts with a simpler interface
 * that integrates with the gateway event stream.
 */

import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import { writeFile, unlink, mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  PTY_DEFAULT_COLS,
  PTY_DEFAULT_ROWS,
  FLEET_SESSIONS_DIR,
  SIGNAL_ESCALATION,
} from "../config/index.js";
import type { SessionEvent, StdoutEvent } from "./protocol.js";
import { getTracer, withSpan, addPtyAttributes } from "../telemetry/spans.js";
import { recordPtyActive, recordError as recordErrorMetric } from "../telemetry/metrics.js";

export interface PtyBridgeCallbacks {
  onOutput: (sessionId: string, event: SessionEvent) => void;
  onExit: (sessionId: string, code: number, signal?: string) => void;
}

export interface PtySessionInfo {
  sessionId: string;
  projectId: string;
  pid: number;
  cwd: string;
  createdAt: string;
  cols: number;
  rows: number;
}

export interface CreatePtyOptions {
  projectId: string;
  cwd: string;
  command?: string[];
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

interface PtyProcess {
  sessionId: string;
  projectId: string;
  process: pty.IPty;
  cwd: string;
  createdAt: string;
  cols: number;
  rows: number;
  pidFile: string;
}

/**
 * Manages PTY sessions for the gateway.
 */
export class PtyBridge {
  private sessions = new Map<string, PtyProcess>();
  private onOutput: PtyBridgeCallbacks["onOutput"];
  private onExit: PtyBridgeCallbacks["onExit"];

  constructor(callbacks: PtyBridgeCallbacks) {
    this.onOutput = callbacks.onOutput;
    this.onExit = callbacks.onExit;
  }

  /**
   * Create a new PTY session.
   */
  async create(options: CreatePtyOptions): Promise<PtySessionInfo> {
    const tracer = getTracer();
    const span = tracer.startSpan("pty.create", {
      attributes: {
        "pty.project_id": options.projectId,
        "pty.cwd": options.cwd,
        "pty.command": (options.command ?? ["claude"]).join(" "),
      },
    });

    try {
      const sessionId = `s_${randomUUID().replace(/-/g, "").substring(0, 12)}`;
      const { projectId, cwd, command, cols, rows, env } = options;

      const termCols = cols ?? PTY_DEFAULT_COLS;
      const termRows = rows ?? PTY_DEFAULT_ROWS;

      // Default command is claude CLI
      const shellCommand = command ?? ["claude"];
      const shell = shellCommand[0];
      const args = shellCommand.slice(1);

      // Build environment with FLEET_SESSION_ID for hooks
      const spawnEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FLEET_SESSION_ID: sessionId,
      };

      // Spawn the PTY process
      const proc = pty.spawn(shell, args, {
        name: "xterm-256color",
        cols: termCols,
        rows: termRows,
        cwd,
        env: spawnEnv,
      });

      const now = new Date().toISOString();

      // Create PID file for crash recovery
      await mkdir(FLEET_SESSIONS_DIR, { recursive: true });
      const pidFile = path.join(FLEET_SESSIONS_DIR, `${sessionId}.pid`);
      await writeFile(pidFile, JSON.stringify({
        pid: proc.pid,
        sessionId,
        projectId,
        cwd,
        createdAt: now,
      }));

      const session: PtyProcess = {
        sessionId,
        projectId,
        process: proc,
        cwd,
        createdAt: now,
        cols: termCols,
        rows: termRows,
        pidFile,
      };

      this.sessions.set(sessionId, session);

      // Update PTY session count metric
      recordPtyActive(this.sessions.size);

      // Handle PTY output
      proc.onData((data) => {
        const event: StdoutEvent = {
          type: "stdout",
          data,
          timestamp: new Date().toISOString(),
        };
        this.onOutput(sessionId, event);
      });

      // Handle PTY exit
      proc.onExit(({ exitCode, signal }) => {
        this.cleanup(sessionId);
        this.onExit(sessionId, exitCode, signal ? String(signal) : undefined);
      });

      span.setAttribute("pty.session_id", sessionId);
      span.setAttribute("pty.pid", proc.pid);
      console.log(`[PTY] Created session ${sessionId} for project ${projectId} (pid=${proc.pid})`);

      return {
        sessionId,
        projectId,
        pid: proc.pid,
        cwd,
        createdAt: now,
        cols: termCols,
        rows: termRows,
      };
    } finally {
      span.end();
    }
  }

  /**
   * Get session info.
   */
  getSession(sessionId: string): PtySessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    return {
      sessionId: session.sessionId,
      projectId: session.projectId,
      pid: session.process.pid,
      cwd: session.cwd,
      createdAt: session.createdAt,
      cols: session.cols,
      rows: session.rows,
    };
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): PtySessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      sessionId: s.sessionId,
      projectId: s.projectId,
      pid: s.process.pid,
      cwd: s.cwd,
      createdAt: s.createdAt,
      cols: s.cols,
      rows: s.rows,
    }));
  }

  /**
   * Write stdin to a session.
   */
  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.process.write(data);
    return true;
  }

  /**
   * Resize a session.
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.process.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
    return true;
  }

  /**
   * Send a signal to a session with escalation.
   */
  async signal(sessionId: string, signal: "SIGINT" | "SIGTERM" | "SIGKILL"): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      // Kill the process group (negative PID)
      process.kill(-session.process.pid, signal);
      console.log(`[PTY] Sent ${signal} to session ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`[PTY] Failed to send ${signal} to ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Gracefully stop a session with signal escalation.
   */
  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const tracer = getTracer();
    const span = tracer.startSpan("pty.stop", {
      attributes: {
        "pty.session_id": sessionId,
        "pty.project_id": session.projectId,
        "pty.pid": session.process.pid,
      },
    });

    try {
      // Signal escalation: SIGINT -> SIGTERM -> SIGKILL
      const signals: Array<{ signal: NodeJS.Signals; delayMs: number }> = [
        { signal: "SIGINT", delayMs: SIGNAL_ESCALATION.SIGINT_TO_SIGTERM_MS },
        { signal: "SIGTERM", delayMs: SIGNAL_ESCALATION.SIGTERM_TO_SIGKILL_MS },
        { signal: "SIGKILL", delayMs: 1000 },
      ];

      for (const { signal, delayMs } of signals) {
        try {
          process.kill(-session.process.pid, signal);
          console.log(`[PTY] Sent ${signal} to session ${sessionId}`);

          // Wait for process to exit or timeout
          const exited = await this.waitForExit(sessionId, delayMs);
          if (exited) {
            console.log(`[PTY] Session ${sessionId} exited after ${signal}`);
            span.setAttribute("pty.exit_signal", signal);
            return;
          }
        } catch {
          // Process may have already exited
          if (!this.sessions.has(sessionId)) {
            span.setAttribute("pty.exit_signal", "already_exited");
            return;
          }
        }
      }

      console.log(`[PTY] Session ${sessionId} did not respond to signals, forcing cleanup`);
      span.setAttribute("pty.exit_signal", "forced_cleanup");
      this.cleanup(sessionId);
    } finally {
      span.end();
    }
  }

  /**
   * Wait for a session to exit.
   */
  private waitForExit(sessionId: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.sessions.has(sessionId)) {
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, timeoutMs);
    });
  }

  /**
   * Clean up a session.
   */
  private async cleanup(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Remove PID file
    try {
      await unlink(session.pidFile);
    } catch {
      // File may not exist
    }

    // Kill process if still running
    try {
      session.process.kill();
    } catch {
      // Process may have already exited
    }

    this.sessions.delete(sessionId);

    // Update PTY session count metric
    recordPtyActive(this.sessions.size);

    console.log(`[PTY] Cleaned up session ${sessionId}`);
  }

  /**
   * Destroy all sessions.
   */
  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.stop(id)));
  }

  /**
   * Recover orphaned sessions from PID files (crash recovery).
   */
  async recoverOrphans(): Promise<string[]> {
    const recovered: string[] = [];

    try {
      if (!existsSync(FLEET_SESSIONS_DIR)) return recovered;

      const files = await readdir(FLEET_SESSIONS_DIR);
      const pidFiles = files.filter((f) => f.endsWith(".pid"));

      for (const file of pidFiles) {
        const filePath = path.join(FLEET_SESSIONS_DIR, file);
        try {
          const content = await readFile(filePath, "utf-8");
          const info = JSON.parse(content);

          // Check if process is still running
          try {
            process.kill(info.pid, 0); // Check existence
            console.log(`[PTY] Found orphaned session ${info.sessionId} (pid=${info.pid})`);
            recovered.push(info.sessionId);
            // Note: We can't reattach to the PTY, but we can track it exists
          } catch {
            // Process not running, clean up stale PID file
            await unlink(filePath);
            console.log(`[PTY] Cleaned up stale PID file for ${info.sessionId}`);
          }
        } catch {
          // Invalid PID file, remove it
          await unlink(filePath);
        }
      }
    } catch (error) {
      console.error("[PTY] Failed to recover orphans:", error);
    }

    return recovered;
  }
}
