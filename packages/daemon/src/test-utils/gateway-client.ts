/**
 * WebSocket test client for Gateway E2E tests.
 *
 * Provides typed message helpers and event waiting utilities.
 */

import WebSocket from "ws";
import type {
  ClientMessage,
  GatewayMessage,
  SessionCreatedMessage,
  SessionEventMessage,
  SessionStatusMessage,
  SessionEndedMessage,
  FleetEventMessage,
  JobStartedMessage,
  JobStreamMessage,
  JobCompletedMessage,
  ErrorMessage,
} from "../gateway/protocol.js";

export interface GatewayClientOptions {
  url?: string;
  timeout?: number;
}

/**
 * Test client for interacting with the Gateway WebSocket server.
 */
export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private timeout: number;
  private messages: GatewayMessage[] = [];
  private waiters: Array<{
    resolve: (msg: GatewayMessage) => void;
    reject: (err: Error) => void;
    filter: (msg: GatewayMessage) => boolean;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(options: GatewayClientOptions = {}) {
    this.url = options.url ?? "ws://127.0.0.1:4452";
    this.timeout = options.timeout ?? 5000;
  }

  /**
   * Connect to the gateway server.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        clearTimeout(timer);
        resolve();
      });

      this.ws.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      this.ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString()) as GatewayMessage;
          this.messages.push(message);
          this.notifyWaiters(message);
        } catch {
          // Ignore parse errors
        }
      });

      this.ws.on("close", () => {
        this.rejectAllWaiters(new Error("Connection closed"));
      });
    });
  }

  /**
   * Close the connection.
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messages = [];
    this.rejectAllWaiters(new Error("Client closed"));
  }

  /**
   * Send a message to the gateway.
   */
  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send ping and wait for pong.
   */
  async ping(): Promise<void> {
    this.send({ type: "ping" });
    await this.waitFor((msg) => msg.type === "pong");
  }

  /**
   * Subscribe to fleet events.
   */
  async subscribeFleet(fromEventId = 0): Promise<void> {
    this.send({ type: "fleet.subscribe", from_event_id: fromEventId });
  }

  /**
   * Create a new session.
   */
  async createSession(params: {
    projectId: string;
    repoRoot: string;
    command?: string[];
    cols?: number;
    rows?: number;
  }): Promise<SessionCreatedMessage> {
    this.send({
      type: "session.create",
      project_id: params.projectId,
      repo_root: params.repoRoot,
      command: params.command,
      cols: params.cols,
      rows: params.rows,
    });
    return (await this.waitFor(
      (msg) => msg.type === "session.created" || msg.type === "error"
    )) as SessionCreatedMessage;
  }

  /**
   * Attach to an existing session.
   */
  async attachSession(sessionId: string, fromSeq?: number): Promise<SessionStatusMessage | ErrorMessage> {
    this.send({
      type: "session.attach",
      session_id: sessionId,
      from_seq: fromSeq,
    });
    return (await this.waitFor(
      (msg) =>
        (msg.type === "session.status" && (msg as SessionStatusMessage).session_id === sessionId) ||
        msg.type === "error"
    )) as SessionStatusMessage | ErrorMessage;
  }

  /**
   * Detach from a session.
   */
  detachSession(sessionId: string): void {
    this.send({
      type: "session.detach",
      session_id: sessionId,
    });
  }

  /**
   * Send stdin to a session.
   */
  sendStdin(sessionId: string, data: string): void {
    this.send({
      type: "session.stdin",
      session_id: sessionId,
      data,
    });
  }

  /**
   * Send signal to a session.
   */
  sendSignal(sessionId: string, signal: "SIGINT" | "SIGTERM" | "SIGKILL"): void {
    this.send({
      type: "session.signal",
      session_id: sessionId,
      signal,
    });
  }

  /**
   * Resize session PTY.
   */
  resize(sessionId: string, cols: number, rows: number): void {
    this.send({
      type: "session.resize",
      session_id: sessionId,
      cols,
      rows,
    });
  }

  /**
   * Create a headless job.
   */
  async createJob(params: {
    type: string;
    projectId?: string;
    repoRoot?: string;
    model: "opus" | "sonnet" | "haiku";
    prompt: string;
    systemPrompt?: string;
    jsonSchema?: string;
    maxTurns?: number;
    disallowedTools?: string[];
  }): Promise<JobStartedMessage | ErrorMessage> {
    this.send({
      type: "job.create",
      job: {
        type: params.type,
        project_id: params.projectId,
        repo_root: params.repoRoot,
        model: params.model,
        request: {
          prompt: params.prompt,
          system_prompt: params.systemPrompt,
          json_schema: params.jsonSchema,
          max_turns: params.maxTurns,
          disallowed_tools: params.disallowedTools,
        },
      },
    });
    return (await this.waitFor(
      (msg) => msg.type === "job.started" || msg.type === "error"
    )) as JobStartedMessage | ErrorMessage;
  }

  /**
   * Cancel a job.
   */
  cancelJob(jobId: number): void {
    this.send({ type: "job.cancel", job_id: jobId });
  }

  /**
   * Wait for a message matching the filter.
   */
  async waitFor<T extends GatewayMessage>(
    filter: (msg: GatewayMessage) => boolean,
    timeoutMs?: number
  ): Promise<T> {
    const timeout = timeoutMs ?? this.timeout;

    // Check existing messages
    const existing = this.messages.find(filter);
    if (existing) {
      return existing as T;
    }

    // Wait for new message
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for message after ${timeout}ms`));
      }, timeout);

      this.waiters.push({
        resolve: resolve as (msg: GatewayMessage) => void,
        reject,
        filter,
        timer,
      });
    });
  }

  /**
   * Wait for session event.
   */
  async waitForEvent(sessionId: string, timeoutMs?: number): Promise<SessionEventMessage> {
    return this.waitFor<SessionEventMessage>(
      (msg) => msg.type === "event" && (msg as SessionEventMessage).session_id === sessionId,
      timeoutMs
    );
  }

  /**
   * Wait for session ended.
   */
  async waitForSessionEnded(sessionId: string, timeoutMs?: number): Promise<SessionEndedMessage> {
    return this.waitFor<SessionEndedMessage>(
      (msg) => msg.type === "session.ended" && (msg as SessionEndedMessage).session_id === sessionId,
      timeoutMs
    );
  }

  /**
   * Wait for fleet event.
   */
  async waitForFleetEvent(timeoutMs?: number): Promise<FleetEventMessage> {
    return this.waitFor<FleetEventMessage>((msg) => msg.type === "fleet.event", timeoutMs);
  }

  /**
   * Wait for job stream chunk.
   */
  async waitForJobStream(jobId: number, timeoutMs?: number): Promise<JobStreamMessage> {
    return this.waitFor<JobStreamMessage>(
      (msg) => msg.type === "job.stream" && (msg as JobStreamMessage).job_id === jobId,
      timeoutMs
    );
  }

  /**
   * Wait for job completion.
   */
  async waitForJobCompleted(jobId: number, timeoutMs?: number): Promise<JobCompletedMessage> {
    return this.waitFor<JobCompletedMessage>(
      (msg) => msg.type === "job.completed" && (msg as JobCompletedMessage).job_id === jobId,
      timeoutMs
    );
  }

  /**
   * Collect all messages of a type.
   */
  getMessages<T extends GatewayMessage>(filter: (msg: GatewayMessage) => boolean): T[] {
    return this.messages.filter(filter) as T[];
  }

  /**
   * Get all received messages.
   */
  getAllMessages(): GatewayMessage[] {
    return [...this.messages];
  }

  /**
   * Clear collected messages.
   */
  clearMessages(): void {
    this.messages = [];
  }

  private notifyWaiters(message: GatewayMessage): void {
    const matching = this.waiters.filter((w) => w.filter(message));
    for (const waiter of matching) {
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      const idx = this.waiters.indexOf(waiter);
      if (idx >= 0) this.waiters.splice(idx, 1);
    }
  }

  private rejectAllWaiters(error: Error): void {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters = [];
  }
}

/**
 * Create a connected gateway client.
 */
export async function createGatewayClient(
  options?: GatewayClientOptions
): Promise<GatewayClient> {
  const client = new GatewayClient(options);
  await client.connect();
  return client;
}
