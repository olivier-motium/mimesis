/**
 * Gateway types - Type definitions for WebSocket protocol and state.
 *
 * Mirrored from daemon/gateway/protocol.ts for client-side usage.
 */

// ============================================================================
// Session Types
// ============================================================================

export interface SessionState {
  sessionId: string;
  projectId: string;
  pid: number;
  status: "working" | "waiting" | "idle";
  attachedClients: number;
}

/**
 * Tracked session from gateway session store (v5.2).
 * Unified representation of sessions from both watcher and PTY sources.
 */
export interface TrackedSession {
  sessionId: string;
  projectId?: string;
  cwd: string;
  status: "working" | "waiting" | "idle";
  source: "watcher" | "pty";
  lastActivityAt: string;
  createdAt: string;
  gitBranch?: string | null;
  gitRepoUrl?: string | null;
  originalPrompt?: string | null;
  fileStatus?: {
    status: string;
    updated: string;
    task?: string;
    summary?: string;
    blockedOn?: string;
    error?: string;
    currentFile?: string;
    toolCount?: number;
    todos?: Array<{ content: string; status: string }>;
  } | null;
  pid?: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface FleetEvent {
  eventId: number;
  ts: string;
  type: string;
  projectId?: string;
  briefingId?: number;
  data: unknown;
}

export interface SessionEvent {
  type: "stdout" | "tool" | "text" | "thinking" | "progress" | "status_change";
  timestamp: string;
  // stdout
  data?: string;
  // tool
  phase?: "pre" | "post";
  tool_name?: string;
  tool_input?: unknown;
  tool_result?: unknown;
  ok?: boolean;
  // text
  text?: string;
  // thinking
  thinking?: string;
  // status_change
  status?: "working" | "waiting" | "idle";
}

/** Session event with sequence number for ordering */
export interface SequencedSessionEvent extends SessionEvent {
  seq: number;
  sessionId: string;
}

// ============================================================================
// Job Types
// ============================================================================

export interface JobState {
  jobId: number;
  projectId?: string;
  status: "running" | "completed" | "failed";
  events: JobStreamChunk[];
  result?: JobResult;
  error?: string;
}

export interface JobStreamChunk {
  type: string;
  // Various stream-json fields
  [key: string]: unknown;
}

export interface JobResult {
  text?: string;
  thinking?: string;
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
}

export interface JobCreateRequest {
  type: string;
  projectId?: string;
  repoRoot?: string;
  model: "opus" | "sonnet" | "haiku";
  request: {
    prompt: string;
    systemPrompt?: string;
    maxTurns?: number;
    disallowedTools?: string[];
  };
}

// ============================================================================
// Commander Types
// ============================================================================

/**
 * Commander state (PTY-based Commander).
 */
export interface CommanderState {
  status: "idle" | "working" | "waiting_for_input";
  ptySessionId: string | null;
  claudeSessionId: string | null;
  queuedPrompts: number;
  isFirstTurn: boolean;
}

// ============================================================================
// Connection Types
// ============================================================================

export type GatewayStatus = "connecting" | "connected" | "disconnected";
