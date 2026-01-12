/**
 * Fleet Gateway WebSocket Protocol Definitions
 *
 * Defines all message types for client-gateway communication.
 * Based on Fleet Commander v5 specification.
 */

import type { TrackedSession } from "./session-store.js";

// =============================================================================
// Client → Gateway Messages
// =============================================================================

export interface FleetSubscribeMessage {
  type: "fleet.subscribe";
  from_event_id: number;
}

export interface SessionCreateMessage {
  type: "session.create";
  project_id: string;
  repo_root: string;
  command?: string[];
  cols?: number;
  rows?: number;
}

export interface SessionAttachMessage {
  type: "session.attach";
  session_id: string;
  from_seq?: number;
}

export interface SessionDetachMessage {
  type: "session.detach";
  session_id: string;
}

export interface SessionStdinMessage {
  type: "session.stdin";
  session_id: string;
  data: string;
}

export interface SessionSignalMessage {
  type: "session.signal";
  session_id: string;
  signal: "SIGINT" | "SIGTERM" | "SIGKILL";
}

export interface SessionResizeMessage {
  type: "session.resize";
  session_id: string;
  cols: number;
  rows: number;
}

export interface JobCreateMessage {
  type: "job.create";
  job: {
    type: string;
    project_id?: string;
    repo_root?: string;
    model: "opus" | "sonnet" | "haiku";
    request: {
      prompt: string;
      system_prompt?: string;
      json_schema?: string;
      max_turns?: number;
      disallowed_tools?: string[];
    };
  };
}

export interface JobCancelMessage {
  type: "job.cancel";
  job_id: number;
}

/**
 * Send a prompt to Commander (stateful Opus conversation).
 * Gateway handles conversation state internally.
 */
export interface CommanderSendMessage {
  type: "commander.send";
  /** User prompt to send to Commander */
  prompt: string;
}

/**
 * Reset the Commander conversation to start fresh.
 */
export interface CommanderResetMessage {
  type: "commander.reset";
}

export interface PingMessage {
  type: "ping";
}

export interface SessionsListMessage {
  type: "sessions.list";
}

export type ClientMessage =
  | FleetSubscribeMessage
  | SessionCreateMessage
  | SessionAttachMessage
  | SessionDetachMessage
  | SessionStdinMessage
  | SessionSignalMessage
  | SessionResizeMessage
  | JobCreateMessage
  | JobCancelMessage
  | CommanderSendMessage
  | CommanderResetMessage
  | PingMessage
  | SessionsListMessage;

// =============================================================================
// Gateway → Client Messages
// =============================================================================

export interface FleetEventMessage {
  type: "fleet.event";
  event_id: number;
  ts: string;
  event: FleetEventPayload;
}

export interface FleetEventPayload {
  type: "briefing_added" | "skill_updated" | "job_completed" | "error";
  project_id?: string;
  briefing_id?: number;
  job_id?: number;
  data?: unknown;
}

export interface SessionCreatedMessage {
  type: "session.created";
  session_id: string;
  project_id: string;
  pid: number;
}

export interface SessionStatusMessage {
  type: "session.status";
  session_id: string;
  status: "working" | "waiting" | "idle";
}

export interface SessionEndedMessage {
  type: "session.ended";
  session_id: string;
  exit_code: number;
  signal?: string;
}

export interface SessionEventMessage {
  type: "event";
  session_id: string;
  seq: number;
  event: SessionEvent;
}

export type SessionEvent =
  | StdoutEvent
  | ToolEvent
  | TextEvent
  | ThinkingEvent
  | ProgressEvent
  | StatusChangeEvent;

export interface StdoutEvent {
  type: "stdout";
  data: string;
  timestamp: string;
}

export interface ToolEvent {
  type: "tool";
  phase: "pre" | "post";
  tool_name: string;
  tool_input?: unknown;
  tool_result?: unknown;
  ok?: boolean;
  timestamp: string;
}

export interface TextEvent {
  type: "text";
  data: string;
  timestamp: string;
}

export interface ThinkingEvent {
  type: "thinking";
  data: string;
  timestamp: string;
}

export interface ProgressEvent {
  type: "progress";
  percentage?: number;
  message?: string;
  timestamp: string;
}

export interface StatusChangeEvent {
  type: "status_change";
  from: string;
  to: string;
  timestamp: string;
}

export interface JobStartedMessage {
  type: "job.started";
  job_id: number;
  project_id?: string;
}

export interface JobStreamMessage {
  type: "job.stream";
  job_id: number;
  chunk: StreamJsonChunk;
}

export interface JobCompletedMessage {
  type: "job.completed";
  job_id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface PongMessage {
  type: "pong";
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

// Session tracking messages (v5.2 - unified session store)
export interface SessionsSnapshotMessage {
  type: "sessions.snapshot";
  sessions: TrackedSession[];
}

export interface SessionDiscoveredMessage {
  type: "session.discovered";
  session: TrackedSession;
}

export interface SessionUpdatedMessage {
  type: "session.updated";
  session_id: string;
  updates: Partial<TrackedSession>;
}

export interface SessionRemovedMessage {
  type: "session.removed";
  session_id: string;
}

export type GatewayMessage =
  | FleetEventMessage
  | SessionCreatedMessage
  | SessionStatusMessage
  | SessionEndedMessage
  | SessionEventMessage
  | SessionsSnapshotMessage
  | SessionDiscoveredMessage
  | SessionUpdatedMessage
  | SessionRemovedMessage
  | JobStartedMessage
  | JobStreamMessage
  | JobCompletedMessage
  | PongMessage
  | ErrorMessage;

// =============================================================================
// Stream JSON Types (Claude -p --output-format stream-json)
// =============================================================================

export interface StreamJsonChunk {
  type: "content_block_start" | "content_block_delta" | "content_block_stop" |
        "message_start" | "message_delta" | "message_stop" |
        "error" | "ping";
  index?: number;
  content_block?: {
    type: "text" | "tool_use" | "thinking";
    id?: string;
    name?: string;
    input?: unknown;
    text?: string;
    thinking?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
    stop_reason?: string;
  };
  message?: {
    id: string;
    type: string;
    role: string;
    model: string;
    content: unknown[];
    stop_reason?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  error?: {
    type: string;
    message: string;
  };
}

// =============================================================================
// Hook Event Types (from hooks via Unix socket)
// =============================================================================

export interface HookEvent {
  fleet_session_id: string;
  hook_type: string;
  event_type?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_result?: unknown;
  phase?: "pre" | "post";
  ok?: boolean;
  timestamp?: string;
  cwd?: string;
  session_id?: string;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Parse a client message from JSON string.
 */
export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const message = JSON.parse(data);
    if (typeof message.type !== "string") return null;
    return message as ClientMessage;
  } catch {
    return null;
  }
}

/**
 * Serialize a gateway message to JSON string.
 */
export function serializeGatewayMessage(message: GatewayMessage): string {
  return JSON.stringify(message);
}

/**
 * Parse a hook event from JSON line.
 */
export function parseHookEvent(line: string): HookEvent | null {
  try {
    const event = JSON.parse(line);
    if (typeof event.fleet_session_id !== "string") return null;
    return event as HookEvent;
  } catch {
    return null;
  }
}
