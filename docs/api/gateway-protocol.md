# Gateway WebSocket Protocol

Complete reference for the Fleet Gateway WebSocket protocol (port 4452).

## Overview

The Gateway is the primary real-time communication channel between the UI and daemon. It handles:

- Session lifecycle (create, attach, detach)
- Event streaming (PTY output, tool use, text, thinking)
- Fleet events (briefings, jobs, cross-project notifications)
- Headless job management (Commander)

## Connection

```typescript
const ws = new WebSocket("ws://localhost:4452");

ws.onopen = () => {
  // Subscribe to fleet events
  ws.send(JSON.stringify({ type: "fleet.subscribe", from_event_id: 0 }));

  // Request current session list
  ws.send(JSON.stringify({ type: "sessions.list" }));
};
```

---

## Client → Gateway Messages

### Session Management

#### `sessions.list`
Request current session snapshot.

```typescript
{ type: "sessions.list" }
```

**Response:** `sessions.snapshot`

---

#### `session.create`
Create a new PTY session.

```typescript
{
  type: "session.create",
  project_id: string,      // Stable project identifier
  repo_root: string,       // Absolute path to repo
  command?: string[],      // Custom command (default: ["claude"])
  cols?: number,           // Terminal width (default: 120)
  rows?: number            // Terminal height (default: 40)
}
```

**Response:** `session.created`

---

#### `session.attach`
Attach to a session's event stream.

```typescript
{
  type: "session.attach",
  session_id: string,
  from_seq?: number        // Resume from sequence number
}
```

**Response:** Stream of `event` messages

---

#### `session.detach`
Stop receiving events from a session.

```typescript
{
  type: "session.detach",
  session_id: string
}
```

---

#### `session.stdin`
Send input to a PTY session.

```typescript
{
  type: "session.stdin",
  session_id: string,
  data: string             // Raw terminal input
}
```

---

#### `session.signal`
Send a signal to a session.

```typescript
{
  type: "session.signal",
  session_id: string,
  signal: "SIGINT" | "SIGTERM" | "SIGKILL"
}
```

---

#### `session.resize`
Resize a PTY session.

```typescript
{
  type: "session.resize",
  session_id: string,
  cols: number,
  rows: number
}
```

---

### Fleet Events

#### `fleet.subscribe`
Subscribe to fleet-wide events.

```typescript
{
  type: "fleet.subscribe",
  from_event_id: number    // Resume from event ID (0 for all)
}
```

**Response:** Stream of `fleet.event` messages

---

### Job Management

#### `job.create`
Create a headless job (Commander).

```typescript
{
  type: "job.create",
  job: {
    type: "worker_task" | "skill_patch" | "doc_patch" | "commander_turn",
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
```

**Response:** `job.started`, then `job.stream` chunks, then `job.completed`

---

#### `job.cancel`
Cancel a running job.

```typescript
{
  type: "job.cancel",
  job_id: number
}
```

---

### Utility

#### `ping`
Keep-alive ping.

```typescript
{ type: "ping" }
```

**Response:** `pong`

---

## Gateway → Client Messages

### Session Lifecycle

#### `sessions.snapshot`
Full session list (response to `sessions.list`).

```typescript
{
  type: "sessions.snapshot",
  sessions: TrackedSession[]
}
```

---

#### `session.discovered`
New session detected (from watcher or PTY create).

```typescript
{
  type: "session.discovered",
  session: TrackedSession
}
```

---

#### `session.updated`
Session state changed.

```typescript
{
  type: "session.updated",
  session_id: string,
  updates: Partial<TrackedSession>
}
```

---

#### `session.removed`
Session deleted or cleaned up.

```typescript
{
  type: "session.removed",
  session_id: string
}
```

---

#### `session.created`
PTY session created (response to `session.create`).

```typescript
{
  type: "session.created",
  session_id: string,
  project_id: string,
  pid: number
}
```

---

#### `session.status`
Session status changed.

```typescript
{
  type: "session.status",
  session_id: string,
  status: "working" | "waiting" | "idle"
}
```

---

#### `session.ended`
PTY session terminated.

```typescript
{
  type: "session.ended",
  session_id: string,
  exit_code: number,
  signal?: string
}
```

---

### Event Streaming

#### `event`
Session event (after `session.attach`).

```typescript
{
  type: "event",
  session_id: string,
  seq: number,              // Sequence number for replay
  event: SessionEvent
}
```

**SessionEvent Types:**

| Type | Fields | Description |
|------|--------|-------------|
| `stdout` | `data`, `timestamp` | Raw PTY output |
| `tool` | `phase`, `tool_name`, `tool_input?`, `tool_result?`, `ok?`, `timestamp` | Tool use (pre/post) |
| `text` | `data`, `timestamp` | Assistant text output |
| `thinking` | `data`, `timestamp` | Model thinking (extended thinking) |
| `progress` | `percentage?`, `message?`, `timestamp` | Progress indicator |
| `status_change` | `from`, `to`, `timestamp` | Status transition |

---

### Fleet Events

#### `fleet.event`
Fleet-wide event (from outbox).

```typescript
{
  type: "fleet.event",
  event_id: number,
  ts: string,               // ISO timestamp
  event: {
    type: "briefing_added" | "skill_updated" | "job_completed" | "error",
    project_id?: string,
    briefing_id?: number,
    job_id?: number,
    data?: unknown
  }
}
```

---

### Job Streaming

#### `job.started`
Job execution began.

```typescript
{
  type: "job.started",
  job_id: number,
  project_id?: string
}
```

---

#### `job.stream`
Streaming job output (Claude stream-json format).

```typescript
{
  type: "job.stream",
  job_id: number,
  chunk: StreamJsonChunk
}
```

---

#### `job.completed`
Job finished.

```typescript
{
  type: "job.completed",
  job_id: number,
  ok: boolean,
  result?: unknown,
  error?: string
}
```

---

### Utility

#### `pong`
Response to ping.

```typescript
{ type: "pong" }
```

---

#### `error`
Error response.

```typescript
{
  type: "error",
  code: string,
  message: string
}
```

---

## TrackedSession Schema

Sessions returned in snapshots and updates:

```typescript
interface TrackedSession {
  sessionId: string;
  projectId?: string;
  repoRoot?: string;
  status: "working" | "waiting" | "idle";
  hasPendingToolUse: boolean;
  pendingTool?: { tool: string; target: string };
  goal?: string;
  summary?: string;
  branch?: string;
  lastActivityAt: string;
  createdAt?: string;
  superseded?: boolean;
  workChainId?: string;
  workChainName?: string;
  source: "watcher" | "pty";
}
```

---

## Hook IPC (Unix Socket)

Hooks communicate via Unix socket at `~/.claude/commander/gateway.sock`.

```typescript
interface HookEvent {
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
```

---

## Related Documentation

- [Gateway Architecture](../architecture/gateway.md)
- [Configuration Reference](../architecture/configuration-reference.md)
- [Fleet DB Schema](../architecture/fleet-db.md)
