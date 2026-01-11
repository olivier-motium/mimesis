/**
 * Fleet Gateway Server - Main WebSocket server for Fleet Commander.
 *
 * Responsibilities:
 * - WebSocket connection management
 * - Session lifecycle (create, attach, detach)
 * - Event streaming (PTY + hooks merged)
 * - Fleet events (outbox broadcast)
 * - Job management (Commander, maintenance)
 * - Unix socket listener for hook IPC
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { createServer, type Server as NetServer, type Socket as NetSocket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import {
  FLEET_GATEWAY_HOST,
  FLEET_GATEWAY_PORT,
  FLEET_GATEWAY_SOCKET,
  RING_BUFFER_SIZE_BYTES,
} from "../config/index.js";
import {
  parseClientMessage,
  serializeGatewayMessage,
  parseHookEvent,
  type ClientMessage,
  type GatewayMessage,
  type SessionEvent,
  type HookEvent,
} from "./protocol.js";
import { PtyBridge, type PtySessionInfo } from "./pty-bridge.js";
import { RingBufferManager } from "./ring-buffer.js";
import { EventMergerManager } from "./event-merger.js";
import { OutboxTailer } from "./outbox-tailer.js";
import { JobManager, type JobEventListener } from "./job-manager.js";

interface ClientState {
  ws: WebSocket;
  attachedSession: string | null;
  fleetSubscribed: boolean;
  fleetCursor: number;
}

/**
 * Fleet Gateway Server implementation.
 */
export class GatewayServer {
  private wss: WebSocketServer | null = null;
  private socketServer: NetServer | null = null;
  private clients = new Map<WebSocket, ClientState>();

  // Core components
  private ptyBridge: PtyBridge;
  private bufferManager: RingBufferManager;
  private mergerManager: EventMergerManager;
  private outboxTailer: OutboxTailer;
  private jobManager: JobManager;

  constructor() {
    // Initialize buffer manager
    this.bufferManager = new RingBufferManager(RING_BUFFER_SIZE_BYTES);

    // Initialize merger manager with buffer factory
    this.mergerManager = new EventMergerManager((sessionId) =>
      this.bufferManager.getOrCreate(sessionId)
    );

    // Initialize PTY bridge with callbacks
    this.ptyBridge = new PtyBridge({
      onOutput: (sessionId, event) => this.handlePtyOutput(sessionId, event),
      onExit: (sessionId, code, signal) => this.handlePtyExit(sessionId, code, signal),
    });

    // Initialize outbox tailer
    this.outboxTailer = new OutboxTailer();

    // Initialize job manager
    this.jobManager = new JobManager();
  }

  /**
   * Start the gateway server.
   */
  async start(): Promise<void> {
    // Initialize job manager (crash recovery)
    await this.jobManager.initialize();

    // Recover orphaned PTY sessions
    await this.ptyBridge.recoverOrphans();

    // Start outbox tailer
    this.outboxTailer.start();

    // Subscribe to fleet events
    this.outboxTailer.subscribe((event) => {
      this.broadcastFleetEvent(event);
    });

    // Start WebSocket server
    this.wss = new WebSocketServer({
      host: FLEET_GATEWAY_HOST,
      port: FLEET_GATEWAY_PORT,
    });

    console.log(`[GATEWAY] WebSocket server listening on ws://${FLEET_GATEWAY_HOST}:${FLEET_GATEWAY_PORT}`);

    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));
    this.wss.on("error", (error) => {
      console.error("[GATEWAY] WebSocket server error:", error);
    });

    // Start Unix socket server for hook IPC
    await this.startSocketServer();
  }

  /**
   * Stop the gateway server.
   */
  async stop(): Promise<void> {
    // Stop outbox tailer
    this.outboxTailer.stop();

    // Shutdown all jobs
    await this.jobManager.shutdown();

    // Destroy all PTY sessions
    await this.ptyBridge.destroyAll();

    // Close WebSocket connections
    for (const client of this.clients.keys()) {
      client.close(1001, "Server shutting down");
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve, reject) => {
        this.wss!.close((err) => (err ? reject(err) : resolve()));
      });
      this.wss = null;
    }

    // Close Unix socket server
    if (this.socketServer) {
      this.socketServer.close();
      if (existsSync(FLEET_GATEWAY_SOCKET)) {
        unlinkSync(FLEET_GATEWAY_SOCKET);
      }
      this.socketServer = null;
    }

    console.log("[GATEWAY] Server stopped");
  }

  /**
   * Start Unix socket server for hook IPC.
   */
  private async startSocketServer(): Promise<void> {
    // Remove stale socket file
    if (existsSync(FLEET_GATEWAY_SOCKET)) {
      unlinkSync(FLEET_GATEWAY_SOCKET);
    }

    this.socketServer = createServer((socket: NetSocket) => {
      let buffer = "";

      socket.on("data", (data) => {
        buffer += data.toString();

        // Process complete lines
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);

          this.handleHookEvent(line);
        }
      });

      socket.on("error", (error) => {
        // Expected: client disconnected
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.socketServer!.listen(FLEET_GATEWAY_SOCKET, () => {
        console.log(`[GATEWAY] Unix socket listening on ${FLEET_GATEWAY_SOCKET}`);
        resolve();
      });
      this.socketServer!.on("error", reject);
    });
  }

  /**
   * Handle new WebSocket connection.
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientState: ClientState = {
      ws,
      attachedSession: null,
      fleetSubscribed: false,
      fleetCursor: 0,
    };

    this.clients.set(ws, clientState);
    console.log(`[GATEWAY] Client connected (total: ${this.clients.size})`);

    ws.on("message", (data) => {
      const message = parseClientMessage(data.toString());
      if (message) {
        this.handleMessage(ws, clientState, message);
      }
    });

    ws.on("close", () => {
      // Detach from any session
      if (clientState.attachedSession) {
        // Don't need to do anything special, just remove from clients
      }
      this.clients.delete(ws);
      console.log(`[GATEWAY] Client disconnected (remaining: ${this.clients.size})`);
    });

    ws.on("error", (error) => {
      console.error("[GATEWAY] Client error:", error.message);
      this.clients.delete(ws);
    });
  }

  /**
   * Handle incoming client message.
   */
  private handleMessage(ws: WebSocket, state: ClientState, message: ClientMessage): void {
    switch (message.type) {
      case "ping":
        this.send(ws, { type: "pong" });
        break;

      case "fleet.subscribe":
        this.handleFleetSubscribe(ws, state, message.from_event_id);
        break;

      case "session.create":
        this.handleSessionCreate(ws, state, message);
        break;

      case "session.attach":
        this.handleSessionAttach(ws, state, message);
        break;

      case "session.detach":
        this.handleSessionDetach(ws, state, message);
        break;

      case "session.stdin":
        this.handleSessionStdin(state, message);
        break;

      case "session.signal":
        this.handleSessionSignal(state, message);
        break;

      case "session.resize":
        this.handleSessionResize(state, message);
        break;

      case "job.create":
        this.handleJobCreate(ws, message);
        break;

      case "job.cancel":
        this.handleJobCancel(message);
        break;
    }
  }

  /**
   * Handle fleet.subscribe message.
   */
  private handleFleetSubscribe(ws: WebSocket, state: ClientState, fromEventId: number): void {
    state.fleetSubscribed = true;
    state.fleetCursor = fromEventId;

    // Replay events after cursor
    const events = this.outboxTailer.getEventsAfter(fromEventId);
    for (const event of events) {
      this.send(ws, event);
    }
  }

  /**
   * Handle session.create message.
   */
  private async handleSessionCreate(
    ws: WebSocket,
    state: ClientState,
    message: { project_id: string; repo_root: string; command?: string[]; cols?: number; rows?: number }
  ): Promise<void> {
    try {
      const session = await this.ptyBridge.create({
        projectId: message.project_id,
        cwd: message.repo_root,
        command: message.command,
        cols: message.cols,
        rows: message.rows,
      });

      // Auto-attach to the new session
      state.attachedSession = session.sessionId;

      this.send(ws, {
        type: "session.created",
        session_id: session.sessionId,
        project_id: session.projectId,
        pid: session.pid,
      });
    } catch (error) {
      this.send(ws, {
        type: "error",
        code: "SESSION_CREATE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle session.attach message.
   */
  private handleSessionAttach(
    ws: WebSocket,
    state: ClientState,
    message: { session_id: string; from_seq?: number }
  ): void {
    const session = this.ptyBridge.getSession(message.session_id);
    if (!session) {
      this.send(ws, {
        type: "error",
        code: "SESSION_NOT_FOUND",
        message: `Session ${message.session_id} not found`,
      });
      return;
    }

    state.attachedSession = message.session_id;

    // Replay events from sequence
    const merger = this.mergerManager.get(message.session_id);
    if (merger) {
      const events = merger.getEventsFrom(message.from_seq ?? 0);
      for (const { seq, event } of events) {
        this.send(ws, {
          type: "event",
          session_id: message.session_id,
          seq,
          event,
        });
      }
    }

    // Send current status
    this.send(ws, {
      type: "session.status",
      session_id: message.session_id,
      status: "working", // TODO: Infer actual status
    });
  }

  /**
   * Handle session.detach message.
   */
  private handleSessionDetach(
    ws: WebSocket,
    state: ClientState,
    message: { session_id: string }
  ): void {
    if (state.attachedSession === message.session_id) {
      state.attachedSession = null;
    }
  }

  /**
   * Handle session.stdin message.
   */
  private handleSessionStdin(state: ClientState, message: { session_id: string; data: string }): void {
    if (state.attachedSession === message.session_id) {
      this.ptyBridge.write(message.session_id, message.data);
    }
  }

  /**
   * Handle session.signal message.
   */
  private handleSessionSignal(
    state: ClientState,
    message: { session_id: string; signal: "SIGINT" | "SIGTERM" | "SIGKILL" }
  ): void {
    if (state.attachedSession === message.session_id) {
      this.ptyBridge.signal(message.session_id, message.signal);
    }
  }

  /**
   * Handle session.resize message.
   */
  private handleSessionResize(
    state: ClientState,
    message: { session_id: string; cols: number; rows: number }
  ): void {
    if (state.attachedSession === message.session_id) {
      this.ptyBridge.resize(message.session_id, message.cols, message.rows);
    }
  }

  /**
   * Handle job.create message.
   */
  private async handleJobCreate(
    ws: WebSocket,
    message: { job: { type: string; project_id?: string; repo_root?: string; model: "opus" | "sonnet" | "haiku"; request: { prompt: string; system_prompt?: string; json_schema?: string; max_turns?: number; disallowed_tools?: string[] } } }
  ): Promise<void> {
    const listener: JobEventListener = (event) => {
      this.send(ws, event);
    };

    try {
      await this.jobManager.createJob(
        {
          type: message.job.type,
          projectId: message.job.project_id,
          repoRoot: message.job.repo_root,
          model: message.job.model,
          request: {
            prompt: message.job.request.prompt,
            systemPrompt: message.job.request.system_prompt,
            jsonSchema: message.job.request.json_schema,
            maxTurns: message.job.request.max_turns,
            disallowedTools: message.job.request.disallowed_tools,
          },
        },
        listener
      );
    } catch (error) {
      this.send(ws, {
        type: "error",
        code: "JOB_CREATE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle job.cancel message.
   */
  private handleJobCancel(message: { job_id: number }): void {
    this.jobManager.cancelJob(message.job_id);
  }

  /**
   * Handle PTY output event.
   */
  private handlePtyOutput(sessionId: string, event: SessionEvent): void {
    const merger = this.mergerManager.getOrCreate(sessionId);
    const seq = merger.addStdout((event as { data: string }).data);

    // Broadcast to attached clients
    for (const [ws, state] of this.clients) {
      if (state.attachedSession === sessionId) {
        this.send(ws, {
          type: "event",
          session_id: sessionId,
          seq,
          event,
        });
      }
    }
  }

  /**
   * Handle PTY exit event.
   */
  private handlePtyExit(sessionId: string, code: number, signal?: string): void {
    // Notify attached clients
    for (const [ws, state] of this.clients) {
      if (state.attachedSession === sessionId) {
        this.send(ws, {
          type: "session.ended",
          session_id: sessionId,
          exit_code: code,
          signal,
        });
        state.attachedSession = null;
      }
    }

    // Clean up merger and buffer
    this.mergerManager.remove(sessionId);
    this.bufferManager.remove(sessionId);
  }

  /**
   * Handle hook event from Unix socket.
   */
  private handleHookEvent(line: string): void {
    const hookEvent = parseHookEvent(line);
    if (!hookEvent) return;

    const sessionId = hookEvent.fleet_session_id;
    const merger = this.mergerManager.get(sessionId);
    if (!merger) return;

    const seq = merger.addHookEvent(hookEvent);
    if (seq < 0) return;

    // Create session event from hook
    const event = this.hookToSessionEvent(hookEvent);
    if (!event) return;

    // Broadcast to attached clients
    for (const [ws, state] of this.clients) {
      if (state.attachedSession === sessionId) {
        this.send(ws, {
          type: "event",
          session_id: sessionId,
          seq,
          event,
        });
      }
    }
  }

  /**
   * Convert hook event to session event.
   */
  private hookToSessionEvent(hook: HookEvent): SessionEvent | null {
    const timestamp = hook.timestamp ?? new Date().toISOString();

    if (hook.tool_name) {
      return {
        type: "tool",
        phase: hook.phase ?? "post",
        tool_name: hook.tool_name,
        tool_input: hook.tool_input,
        tool_result: hook.tool_result,
        ok: hook.ok ?? true,
        timestamp,
      };
    }

    return null;
  }

  /**
   * Broadcast fleet event to subscribed clients.
   */
  private broadcastFleetEvent(event: GatewayMessage): void {
    for (const [ws, state] of this.clients) {
      if (state.fleetSubscribed) {
        this.send(ws, event);
      }
    }
  }

  /**
   * Send message to client.
   */
  private send(ws: WebSocket, message: GatewayMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serializeGatewayMessage(message));
    }
  }
}
