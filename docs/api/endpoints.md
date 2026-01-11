# REST API Endpoints

Complete reference for the Mimesis REST API (port 4451).

## Overview

The REST API provides HTTP endpoints for session management, terminal control, fleet operations, and debugging. All endpoints are prefixed with `/api`.

**Base URL:** `http://localhost:4451/api`

---

## Session Management

### `GET /sessions/:id/focus`
Focus the terminal window containing a session.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `id` | path | Session ID |

**Response:** `200 OK` on success, `404` if session not found

**Notes:** Uses Kitty remote control to focus the terminal tab. Requires Kitty socket configuration.

---

### `POST /sessions/:id/open`
Open the session in a terminal.

**Request Body:**
```typescript
{
  targetTerminal?: string;  // "kitty" | "new" | "auto"
}
```

**Response:**
```typescript
{
  ok: true;
  message: string;
}
```

---

### `POST /sessions/:id/link-terminal`
Link a session to a specific Kitty terminal tab.

**Request Body:**
```typescript
{
  kittyWindowId: number;
}
```

**Response:** `200 OK` with session info

---

### `POST /sessions/:id/send-text`
Send text input to a session's terminal.

**Request Body:**
```typescript
{
  text: string;
}
```

**Response:** `200 OK` on success

**Notes:** Useful for programmatic input to Claude Code sessions.

---

### `DELETE /sessions/:id`
Clean up a session.

**Response:** `200 OK` on success

---

## Kitty Terminal Control

### `GET /kitty/health`
Check Kitty remote control availability.

**Response:**
```typescript
{
  ok: boolean;
  socket: string;      // Socket path
  connected: boolean;
  error?: string;
}
```

---

### `POST /kitty/setup`
Initialize Kitty remote control connection.

**Response:**
```typescript
{
  ok: boolean;
  message: string;
}
```

---

## Fleet Operations

### `POST /fleet/ingest`
Ingest hook events from Claude Code sessions.

**Request Body:**
```typescript
{
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

**Response:** `200 OK`

---

### `GET /fleet/projects`
List all projects with session counts.

**Response:**
```typescript
{
  projects: Array<{
    projectId: string;
    repoRoot: string;
    sessionCount: number;
    latestActivity: string;
  }>;
}
```

---

### `GET /fleet/briefings`
Get briefings for a project.

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `project_id` | string | Project identifier |
| `limit` | number | Max results (default: 50) |

**Response:**
```typescript
{
  briefings: Array<{
    id: number;
    projectId: string;
    type: string;
    content: string;
    createdAt: string;
  }>;
}
```

---

### `POST /fleet/briefings`
Create a new briefing.

**Request Body:**
```typescript
{
  project_id: string;
  type: string;
  content: string;
}
```

**Response:** `201 Created` with briefing ID

---

### `GET /fleet/outbox`
Get outbox events for streaming.

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `from_id` | number | Start from event ID |
| `limit` | number | Max events (default: 100) |

**Response:**
```typescript
{
  events: Array<{
    id: number;
    ts: string;
    type: string;
    payload: unknown;
  }>;
}
```

---

### `GET /fleet/jobs`
List active jobs.

**Response:**
```typescript
{
  jobs: Array<{
    id: number;
    projectId: string;
    type: string;
    status: "pending" | "running" | "completed" | "failed";
    createdAt: string;
  }>;
}
```

---

### `POST /fleet/jobs`
Create a new headless job.

**Request Body:**
```typescript
{
  project_id?: string;
  repo_root?: string;
  type: "worker_task" | "skill_patch" | "doc_patch" | "commander_turn";
  model: "opus" | "sonnet" | "haiku";
  request: {
    prompt: string;
    system_prompt?: string;
    json_schema?: string;
    max_turns?: number;
    disallowed_tools?: string[];
  };
}
```

**Response:** `201 Created` with job ID

---

### `DELETE /fleet/jobs/:id`
Cancel a running job.

**Response:** `200 OK`

---

### `GET /fleet/commander/history`
Get Commander conversation history.

**Query Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `project_id` | string | Project identifier |
| `limit` | number | Max turns (default: 20) |

**Response:**
```typescript
{
  turns: Array<{
    id: number;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
}
```

---

## Hook Events

### `POST /hooks`
Receive hook events from Claude Code.

**Request Body:**
```typescript
{
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

**Response:** `200 OK`

**Notes:** This endpoint is called by Claude Code hooks to report events. The Gateway processes these events and broadcasts to connected clients.

---

### Tab Management

### `GET /tabs`
List terminal tabs.

**Response:**
```typescript
{
  tabs: Array<{
    id: number;
    title: string;
    sessionId?: string;
  }>;
}
```

---

### `POST /tabs`
Create a new terminal tab.

**Request Body:**
```typescript
{
  title?: string;
  cwd?: string;
}
```

**Response:** `201 Created` with tab ID

---

### `DELETE /tabs/:id`
Close a terminal tab.

**Response:** `200 OK`

---

## Debug

### `GET /debug/sessions`
Get detailed session state for debugging.

**Response:**
```typescript
{
  sessions: Array<{
    sessionId: string;
    projectId: string;
    repoRoot: string;
    status: string;
    source: "watcher" | "pty";
    lastActivityAt: string;
    createdAt: string;
    // Additional internal state
  }>;
}
```

**Notes:** Includes internal state not exposed in normal session endpoints. Use for troubleshooting.

---

## Error Responses

All endpoints return errors in this format:

```typescript
{
  error: string;
  code?: string;
  details?: unknown;
}
```

**Common Status Codes:**
| Code | Meaning |
|------|---------|
| `400` | Bad request (invalid parameters) |
| `404` | Resource not found |
| `500` | Internal server error |

---

## Related Documentation

- [Gateway Protocol](gateway-protocol.md) - WebSocket real-time API
- [Configuration Reference](../architecture/configuration-reference.md) - Port settings
- [Session Lifecycle](../architecture/session-lifecycle.md) - Session states
