# Fleet Gateway Architecture

The Fleet Gateway is the central WebSocket server for real-time session management in Mimesis. It provides bidirectional communication between the UI and Claude Code sessions.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       Fleet Gateway                              │
│                     (Port 4452 WebSocket)                        │
├──────────────────────┬──────────────────────────────────────────┤
│   Session Sources    │           Capabilities                    │
├──────────────────────┼──────────────────────────────────────────┤
│ • PTY Bridge         │ • Full control (stdin, signals, resize)  │
│ • Session Watcher    │ • Read-only monitoring                   │
│ • Status Watcher     │ • File-based status updates              │
├──────────────────────┴──────────────────────────────────────────┤
│                    Event Streaming                               │
│  PTY output + Hook events → Event Merger → Ring Buffer → Client │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Core Server (`gateway-server.ts`)

The `GatewayServer` class manages:

| Component | Purpose |
|-----------|---------|
| `PtyBridge` | Spawn and manage PTY sessions for `claude` processes |
| `RingBufferManager` | Fixed-size event buffers for replay |
| `EventMergerManager` | Merge PTY output with hook events |
| `OutboxTailer` | Broadcast fleet-level events from SQLite outbox |
| `JobManager` | Headless job queue (Commander, maintenance tasks) |
| `SessionStore` | Unified session tracking from all sources |

### Session Store (v5.2)

The `SessionStore` provides unified session tracking:

```typescript
interface TrackedSession {
  sessionId: string;
  cwd: string;
  status: "working" | "waiting" | "idle";
  source: "pty" | "watcher";

  // PTY sessions only
  projectId?: string;
  pid?: number;

  // Watcher sessions only
  gitBranch?: string;
  gitRepoUrl?: string;
  originalPrompt?: string;
  startedAt?: string;
  entries?: LogEntry[];

  // Status file data
  fileStatus?: {
    status: string;
    task?: string;
    summary?: string;
    updated?: string;
  };
}
```

**Two-Tier Session Model:**

| Source | Capabilities | Use Case |
|--------|--------------|----------|
| **PTY** | Full control (stdin, signals, resize, events) | Sessions created via Gateway |
| **Watcher** | Read-only (status, conversation history) | External Claude Code sessions |

---

## WebSocket Protocol

### Connection

```bash
ws://127.0.0.1:4452
```

### Client → Gateway Messages

#### Session Management

| Message | Description |
|---------|-------------|
| `sessions.list` | Request full session snapshot |
| `session.create` | Create new PTY session |
| `session.attach` | Subscribe to session events |
| `session.detach` | Unsubscribe from session |
| `session.stdin` | Send input to PTY (PTY sessions only) |
| `session.signal` | Send signal SIGINT/SIGTERM/SIGKILL (PTY only) |
| `session.resize` | Resize PTY terminal (PTY only) |

#### Fleet Events

| Message | Description |
|---------|-------------|
| `fleet.subscribe` | Subscribe to fleet events from cursor |
| `ping` | Keepalive ping |

#### Jobs

| Message | Description |
|---------|-------------|
| `job.create` | Create headless job |
| `job.cancel` | Cancel running job |

### Gateway → Client Messages

#### Session Events

| Message | Description |
|---------|-------------|
| `sessions.snapshot` | Full list of tracked sessions |
| `session.discovered` | New session found |
| `session.updated` | Session state changed |
| `session.removed` | Session terminated |
| `session.created` | PTY session created (response to create) |
| `session.status` | Session status change |
| `session.ended` | PTY session terminated |
| `event` | Session event (stdout, tool, text, thinking) |

#### Fleet Events

| Message | Description |
|---------|-------------|
| `fleet.event` | Briefing added, skill updated, job completed |

#### Jobs

| Message | Description |
|---------|-------------|
| `job.started` | Job execution started |
| `job.stream` | Streaming response chunk |
| `job.completed` | Job finished (ok/error) |

#### Control

| Message | Description |
|---------|-------------|
| `pong` | Response to ping |
| `error` | Error with code and message |

---

## Message Schemas

### Session Create

```typescript
// Client → Gateway
{
  type: "session.create",
  project_id: string,
  repo_root: string,
  command?: string[],   // Default: ["claude"]
  cols?: number,        // Default: 80
  rows?: number         // Default: 24
}

// Gateway → Client
{
  type: "session.created",
  session_id: string,
  project_id: string,
  pid: number
}
```

### Session Attach

```typescript
// Client → Gateway
{
  type: "session.attach",
  session_id: string,
  from_seq?: number     // Replay events from this sequence
}

// Gateway → Client (event stream)
{
  type: "event",
  session_id: string,
  seq: number,          // Monotonic sequence number
  event: SessionEvent
}
```

### Session Events

```typescript
type SessionEvent =
  | StdoutEvent
  | ToolEvent
  | TextEvent
  | ThinkingEvent
  | ProgressEvent
  | StatusChangeEvent;

interface StdoutEvent {
  type: "stdout";
  data: string;
  timestamp: string;
}

interface ToolEvent {
  type: "tool";
  phase: "pre" | "post";
  tool_name: string;
  tool_input?: unknown;
  tool_result?: unknown;
  ok?: boolean;
  timestamp: string;
}

interface TextEvent {
  type: "text";
  data: string;
  timestamp: string;
}

interface ThinkingEvent {
  type: "thinking";
  data: string;
  timestamp: string;
}
```

### Fleet Subscribe

```typescript
// Client → Gateway
{
  type: "fleet.subscribe",
  from_event_id: number   // Replay events after this ID
}

// Gateway → Client
{
  type: "fleet.event",
  event_id: number,
  ts: string,
  event: {
    type: "briefing_added" | "skill_updated" | "job_completed" | "error",
    project_id?: string,
    briefing_id?: number,
    job_id?: number,
    data?: unknown
  }
}
```

### Job Create

```typescript
// Client → Gateway
{
  type: "job.create",
  job: {
    type: string,                  // "commander" | "maintenance"
    project_id?: string,
    repo_root?: string,
    model: "opus" | "sonnet" | "haiku",
    request: {
      prompt: string,
      system_prompt?: string,
      json_schema?: string,
      max_turns?: number,
      disallowed_tools?: string[]
    }
  }
}

// Gateway → Client (stream)
{
  type: "job.stream",
  job_id: number,
  chunk: StreamJsonChunk           // Claude streaming format
}

// Gateway → Client (complete)
{
  type: "job.completed",
  job_id: number,
  ok: boolean,
  result?: unknown,
  error?: string
}
```

---

## Hook IPC

The Gateway listens on a Unix socket for hook events from Claude Code:

**Socket Path:** `~/.claude/commander/gateway.sock`

### Hook Event Format

```typescript
interface HookEvent {
  fleet_session_id: string;        // Session identifier
  hook_type: string;               // "PreToolUse" | "PostToolUse"
  event_type?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_result?: unknown;
  phase?: "pre" | "post";
  ok?: boolean;
  timestamp?: string;
  cwd?: string;
  session_id?: string;             // Claude Code session ID
}
```

Hooks send newline-delimited JSON to the socket. The Gateway parses these and merges them with PTY output via the EventMerger.

---

## Event Merging

The `EventMergerManager` combines events from multiple sources:

1. **PTY stdout** - Raw terminal output
2. **Hook events** - Tool invocations, thinking blocks
3. **Status changes** - From file-based status

Events are:
- Assigned monotonic sequence numbers
- Stored in a ring buffer for replay
- Broadcast to attached clients

### Ring Buffer

Each session has a fixed-size ring buffer (default: 1MB) that stores recent events. When a client attaches with `from_seq`, events from that sequence forward are replayed.

---

## Client Connection Flow

```
1. Connect to ws://127.0.0.1:4452
2. Send sessions.list → Receive sessions.snapshot
3. Send session.attach(id) → Receive event stream
4. (Optional) Send fleet.subscribe → Receive fleet events
5. Send session.stdin/signal/resize as needed
6. Receive session.ended when PTY exits
```

### Example: UI Connection

```typescript
const ws = new WebSocket("ws://127.0.0.1:4452");

ws.onopen = () => {
  // Get all sessions
  ws.send(JSON.stringify({ type: "sessions.list" }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "sessions.snapshot":
      // Render session list
      break;
    case "session.discovered":
      // Add new session to UI
      break;
    case "event":
      // Render event in timeline
      break;
  }
};
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `SESSION_CREATE_FAILED` | Failed to spawn PTY process |
| `SESSION_NOT_FOUND` | Session ID not found in PTY or watcher |
| `JOB_CREATE_FAILED` | Failed to create headless job |

---

## Configuration

| Constant | Default | Description |
|----------|---------|-------------|
| `FLEET_GATEWAY_HOST` | `127.0.0.1` | WebSocket bind host |
| `FLEET_GATEWAY_PORT` | `4452` | WebSocket port |
| `FLEET_GATEWAY_SOCKET` | `~/.claude/commander/gateway.sock` | Hook IPC socket |
| `RING_BUFFER_SIZE_BYTES` | `1048576` (1MB) | Per-session buffer size |

---

## Related Documentation

- [Fleet DB Schema](fleet-db.md) - SQLite briefing ledger
- [Daemon API](../api/daemon-api.md) - REST API documentation
- [Configuration Reference](../operations/configuration.md) - Environment variables
