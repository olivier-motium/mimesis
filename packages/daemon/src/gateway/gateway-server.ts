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
 * - Unified session tracking (v5.2)
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
  type ClientMessage,
  type GatewayMessage,
} from "./protocol.js";
import { PtyBridge } from "./pty-bridge.js";
import { RingBufferManager } from "./ring-buffer.js";
import { EventMergerManager } from "./event-merger.js";
import { OutboxTailer } from "./outbox-tailer.js";
import { JobManager } from "./job-manager.js";
import { SessionStore, type SessionStoreEvent } from "./session-store.js";
import type { SessionWatcher, SessionEvent as WatcherSessionEvent } from "../watcher.js";
import type { StatusWatcher, StatusUpdateEvent } from "../status-watcher.js";

// Handler imports
import {
  type ClientState,
  type PtyHandlerDependencies,
  handleSessionCreate,
  handleSessionStdin,
  handleSessionSignal,
  handleSessionResize,
  handlePtyOutput,
  handlePtyExit,
} from "./handlers/pty-session-handlers.js";
import {
  type WatcherHandlerDependencies,
  handleWatcherSession,
  handleStatusUpdate,
  handleSessionsList,
  handleWatcherSessionAttach,
} from "./handlers/watcher-handlers.js";
import {
  type JobHandlerDependencies,
  type JobCreateMessage,
  handleJobCreate,
  handleJobCancel,
} from "./handlers/job-handlers.js";
import {
  type HookHandlerDependencies,
  handleHookEvent,
} from "./handlers/hook-handlers.js";
import {
  type CommanderHandlerDependencies,
  handleCommanderSend,
  handleCommanderReset,
  handleCommanderCancel,
  setupCommanderEventForwarding,
} from "./handlers/commander-handlers.js";
import { CommanderSessionManager } from "./commander-session.js";
import {
  withSpan,
  addWebSocketAttributes,
  recordError as recordSpanError,
} from "../telemetry/spans.js";
import {
  recordGatewayConnection,
  recordMessageProcessed,
  recordError as recordErrorMetric,
} from "../telemetry/metrics.js";

/**
 * Gateway server options.
 */
export interface GatewayServerOptions {
  /** SessionWatcher for detecting external Claude Code sessions */
  sessionWatcher?: SessionWatcher;
  /** StatusWatcher for tracking session status files */
  statusWatcher?: StatusWatcher;
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

  // Session tracking (v5.2)
  private sessionStore: SessionStore;
  private sessionWatcher?: SessionWatcher;
  private statusWatcher?: StatusWatcher;

  // Commander session (PTY-based)
  private commanderSession: CommanderSessionManager;

  // Handler dependencies (lazy initialized)
  private _ptyDeps: PtyHandlerDependencies | null = null;
  private _watcherDeps: WatcherHandlerDependencies | null = null;
  private _jobDeps: JobHandlerDependencies | null = null;
  private _hookDeps: HookHandlerDependencies | null = null;
  private _commanderDeps: CommanderHandlerDependencies | null = null;

  constructor(options: GatewayServerOptions = {}) {
    // Store watchers
    this.sessionWatcher = options.sessionWatcher;
    this.statusWatcher = options.statusWatcher;

    // Initialize session store
    this.sessionStore = new SessionStore();
    // Initialize buffer manager
    this.bufferManager = new RingBufferManager(RING_BUFFER_SIZE_BYTES);

    // Initialize merger manager with buffer factory
    this.mergerManager = new EventMergerManager((sessionId) =>
      this.bufferManager.getOrCreate(sessionId)
    );

    // Initialize PTY bridge with callbacks (use handler module)
    this.ptyBridge = new PtyBridge({
      onOutput: (sessionId, event) => handlePtyOutput(this.ptyDeps, sessionId, event),
      onExit: (sessionId, code, signal) => handlePtyExit(this.ptyDeps, sessionId, code, signal),
    });

    // Initialize outbox tailer
    this.outboxTailer = new OutboxTailer();

    // Initialize job manager
    this.jobManager = new JobManager();

    // Initialize Commander session manager (PTY-based)
    this.commanderSession = new CommanderSessionManager({
      ptyBridge: this.ptyBridge,
      sessionStore: this.sessionStore,
      statusWatcher: this.statusWatcher,
    });
  }

  // ============================================================================
  // Handler Dependencies (lazy getters)
  // ============================================================================

  private get ptyDeps(): PtyHandlerDependencies {
    if (!this._ptyDeps) {
      this._ptyDeps = {
        ptyBridge: this.ptyBridge,
        sessionStore: this.sessionStore,
        mergerManager: this.mergerManager,
        bufferManager: this.bufferManager,
        statusWatcher: this.statusWatcher,
        clients: this.clients,
        send: (ws, msg) => this.send(ws, msg),
        getCommanderPtySessionId: () => this.commanderSession.getPtySessionId(),
        onCommanderPtyExit: (code, signal) => this.commanderSession.handlePtyExit(code, signal),
      };
    }
    return this._ptyDeps;
  }

  private get watcherDeps(): WatcherHandlerDependencies {
    if (!this._watcherDeps) {
      this._watcherDeps = {
        sessionStore: this.sessionStore,
        statusWatcher: this.statusWatcher,
        clients: this.clients,
        send: (ws, msg) => this.send(ws, msg),
      };
    }
    return this._watcherDeps;
  }

  private get jobDeps(): JobHandlerDependencies {
    if (!this._jobDeps) {
      this._jobDeps = {
        jobManager: this.jobManager,
        send: (ws, msg) => this.send(ws, msg),
      };
    }
    return this._jobDeps;
  }

  private get hookDeps(): HookHandlerDependencies {
    if (!this._hookDeps) {
      this._hookDeps = {
        mergerManager: this.mergerManager,
        clients: this.clients,
        send: (ws, msg) => this.send(ws, msg),
      };
    }
    return this._hookDeps;
  }

  private get commanderDeps(): CommanderHandlerDependencies {
    if (!this._commanderDeps) {
      this._commanderDeps = {
        commanderSession: this.commanderSession,
        send: (ws, msg) => this.send(ws, msg),
      };
    }
    return this._commanderDeps;
  }

  /**
   * Start the gateway server.
   */
  async start(): Promise<void> {
    // Initialize job manager (crash recovery)
    await this.jobManager.initialize();

    // Initialize Commander session (resume if possible)
    await this.commanderSession.initialize();

    // Recover orphaned PTY sessions
    await this.ptyBridge.recoverOrphans();

    // Start outbox tailer
    this.outboxTailer.start();

    // Subscribe to fleet events
    this.outboxTailer.subscribe((event) => {
      this.broadcastFleetEvent(event);
    });

    // Subscribe to session store events for broadcasting
    this.sessionStore.subscribe((event) => {
      this.handleSessionStoreEvent(event);
    });

    // Subscribe to session watcher (external sessions)
    if (this.sessionWatcher) {
      this.sessionWatcher.on("session", (event: WatcherSessionEvent) => {
        handleWatcherSession(this.watcherDeps, event);
      });

      // Load existing sessions from watcher
      const existingSessions = this.sessionWatcher.getSessions();
      for (const [, session] of existingSessions) {
        this.sessionStore.addFromWatcher({
          sessionId: session.sessionId,
          cwd: session.cwd,
          status: session.status,
          gitBranch: session.gitBranch,
          gitRepoUrl: session.gitRepoUrl,
          originalPrompt: session.originalPrompt,
          startedAt: session.startedAt,
          entries: session.entries,
        });
      }

    }

    // Subscribe to status watcher (file-based status)
    if (this.statusWatcher) {
      this.statusWatcher.on("status", (event: StatusUpdateEvent) => {
        handleStatusUpdate(this.watcherDeps, event);
      });
    }

    // Start WebSocket server
    this.wss = new WebSocketServer({
      host: FLEET_GATEWAY_HOST,
      port: FLEET_GATEWAY_PORT,
    });

    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));
    this.wss.on("error", () => {
      // WebSocket server error
    });

    // Start Unix socket server for hook IPC
    await this.startSocketServer();
  }

  /**
   * Get the job manager instance.
   * Used by API routes that need to create jobs (e.g., KB sync).
   */
  getJobManager(): JobManager {
    return this.jobManager;
  }

  /**
   * Stop the gateway server.
   */
  async stop(): Promise<void> {
    // Stop outbox tailer
    this.outboxTailer.stop();

    // Shutdown Commander session
    await this.commanderSession.shutdown();

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

          handleHookEvent(this.hookDeps, line);
        }
      });

      socket.on("error", (error) => {
        // Expected: client disconnected
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.socketServer!.listen(FLEET_GATEWAY_SOCKET, () => {
        resolve();
      });
      this.socketServer!.on("error", reject);
    });
  }

  /**
   * Handle new WebSocket connection.
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Setup Commander event forwarding for this client
    const commanderUnsubscribe = setupCommanderEventForwarding(
      this.commanderSession,
      ws,
      (ws, msg) => this.send(ws, msg)
    );

    const clientState: ClientState = {
      ws,
      attachedSession: null,
      fleetSubscribed: false,
      fleetCursor: 0,
      commanderUnsubscribe,
    };

    this.clients.set(ws, clientState);

    // Update metrics
    recordGatewayConnection(this.clients.size);

    // Send initial Commander state
    this.send(ws, {
      type: "commander.state",
      state: this.commanderSession.getState(),
    });

    ws.on("message", (data) => {
      const message = parseClientMessage(data.toString());
      if (message) {
        this.handleMessage(ws, clientState, message);
      }
    });

    ws.on("close", () => {
      // Unsubscribe from Commander events
      if (clientState.commanderUnsubscribe) {
        clientState.commanderUnsubscribe();
      }
      // Detach from any session
      if (clientState.attachedSession) {
        // Don't need to do anything special, just remove from clients
      }
      this.clients.delete(ws);

      // Update metrics
      recordGatewayConnection(this.clients.size);

    });

    ws.on("error", () => {
      this.clients.delete(ws);

      // Update metrics
      recordGatewayConnection(this.clients.size);
      recordErrorMetric("websocket_error", { client: clientId });
    });
  }

  /**
   * Handle incoming client message.
   */
  private handleMessage(ws: WebSocket, state: ClientState, message: ClientMessage): void {
    // Track message processing
    recordMessageProcessed(message.type);

    switch (message.type) {
      case "ping":
        this.send(ws, { type: "pong" });
        break;

      case "fleet.subscribe":
        this.handleFleetSubscribe(ws, state, message.from_event_id);
        break;

      case "session.create":
        handleSessionCreate(this.ptyDeps, ws, state, message);
        break;

      case "session.attach":
        this.handleSessionAttach(ws, state, message);
        break;

      case "session.detach":
        this.handleSessionDetach(ws, state, message);
        break;

      case "session.stdin":
        handleSessionStdin(this.ptyDeps, state, message);
        break;

      case "session.signal":
        handleSessionSignal(this.ptyDeps, state, message);
        break;

      case "session.resize":
        handleSessionResize(this.ptyDeps, state, message);
        break;

      case "job.create":
        handleJobCreate(this.jobDeps, ws, message as JobCreateMessage);
        break;

      case "job.cancel":
        handleJobCancel(this.jobDeps, message);
        break;

      case "sessions.list":
        handleSessionsList(this.watcherDeps, ws);
        break;

      case "commander.send":
        handleCommanderSend(this.commanderDeps, ws, message);
        break;

      case "commander.reset":
        handleCommanderReset(this.commanderDeps, ws);
        break;

      case "commander.cancel":
        handleCommanderCancel(this.commanderDeps, ws);
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
   * Handle session.attach message.
   *
   * Two-tier attach:
   * 1. PTY sessions: Full functionality - events, stdin, signals
   * 2. Watcher sessions: Limited - status only, no terminal interaction
   */
  private handleSessionAttach(
    ws: WebSocket,
    state: ClientState,
    message: { session_id: string; from_seq?: number }
  ): void {
    const sessionId = message.session_id;

    // Check PTY first (full functionality)
    const ptySession = this.ptyBridge.getSession(sessionId);

    if (ptySession) {
      // Full PTY attach - events, stdin, signals available
      state.attachedSession = sessionId;

      // Replay events from sequence
      const merger = this.mergerManager.get(sessionId);
      if (merger) {
        const events = merger.getEventsFrom(message.from_seq ?? 0);
        for (const { seq, event } of events) {
          this.send(ws, {
            type: "event",
            session_id: sessionId,
            seq,
            event,
          });
        }
      }

      // Send current status
      this.send(ws, {
        type: "session.status",
        session_id: sessionId,
        status: "working", // TODO: Infer actual status
      });
      return;
    }

    // Check sessionStore for watcher sessions (read-only mode)
    const trackedSession = this.sessionStore.get(sessionId);

    if (trackedSession) {
      // Delegate to watcher handler
      handleWatcherSessionAttach(this.watcherDeps, ws, state, trackedSession);
      return;
    }

    // Neither PTY nor watcher has this session
    this.send(ws, {
      type: "error",
      code: "SESSION_NOT_FOUND",
      message: `Session ${sessionId} not found`,
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
   * Broadcast fleet event to subscribed clients.
   */
  private broadcastFleetEvent(event: GatewayMessage): void {
    for (const [ws, state] of this.clients) {
      if (state.fleetSubscribed) {
        this.send(ws, event);
      }
    }
  }

  // ==========================================================================
  // Session Tracking (v5.2) - Event Broadcasting
  // ==========================================================================

  /**
   * Handle session store events - broadcast to clients.
   */
  private handleSessionStoreEvent(event: SessionStoreEvent): void {
    switch (event.type) {
      case "discovered":
        this.broadcast({
          type: "session.discovered",
          session: event.session,
        });
        break;

      case "updated":
        this.broadcast({
          type: "session.updated",
          session_id: event.sessionId,
          updates: event.updates,
        });
        break;

      case "removed":
        this.broadcast({
          type: "session.removed",
          session_id: event.sessionId,
        });
        break;
    }
  }

  /**
   * Broadcast message to all connected clients.
   */
  private broadcast(message: GatewayMessage): void {
    for (const ws of this.clients.keys()) {
      this.send(ws, message);
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
