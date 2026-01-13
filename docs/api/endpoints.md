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

## Knowledge Base (KB)

The KB API provides access to the Commander Knowledge Base, a two-layer distilled repository of project knowledge. See [Knowledge Base Architecture](../architecture/knowledge-base.md) for the full system design.

### `GET /kb/projects`
List all KB projects with sync state.

**Response:**
```typescript
{
  success: true;
  initialized: boolean;  // false if KB not yet created
  projects: Array<{
    projectId: string;     // e.g., "mimesis__607a7a7c"
    name: string;          // Human-friendly name from aliases
    lastSyncAt: string | null;
    syncType: "full" | "incremental" | null;
    lastCommitSeen: string | null;
    filesProcessed: number;
    briefingCount: number;  // 14-day briefing count
    isStale: boolean;       // >7 days since last sync
    hasKb: boolean;         // KB directory exists
  }>;
  message?: string;  // When not initialized
}
```

**Notes:** Returns both projects with existing KB directories and active Fleet DB projects that haven't been synced yet.

---

### `GET /kb/projects/:projectId`
Get detailed KB project information.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `projectId` | path | Project ID (e.g., `mimesis__607a7a7c`) |

**Response:**
```typescript
{
  success: true;
  project: {
    projectId: string;
    name: string;
    lastSyncAt: string | null;
    syncType: "full" | "incremental" | null;
    lastCommitSeen: string | null;
    filesProcessed: number;
    briefingCount: number;
    isStale: boolean;
    files: string[];  // Available .md files in KB
  };
}
```

**Errors:**
- `400 Invalid project ID format` - Path traversal or malformed ID
- `404 Project not found in knowledge base`

---

### `GET /kb/projects/:projectId/summary`
Get the project summary from KB.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `projectId` | path | Project ID |

**Response:**
```typescript
{
  success: true;
  summary: {
    projectId: string;
    frontmatter: Record<string, string> | null;  // YAML metadata
    content: string;  // Markdown body
  };
}
```

---

### `GET /kb/projects/:projectId/activity`
Get the project activity summary (Reality Layer).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `projectId` | path | Project ID |

**Response:**
```typescript
{
  success: true;
  activity: {
    projectId: string;
    frontmatter: Record<string, string> | null;
    content: string;
  };
}
```

**Notes:** The activity file contains analysis of 14-day briefings: top changed areas, recurring blockers, and operational patterns.

---

### `GET /kb/stats`
Get fleet-wide KB statistics.

**Response:**
```typescript
{
  success: true;
  initialized: boolean;
  stats: {
    totalProjects: number;
    staleProjects: number;  // >7 days since sync
    neverSynced: number;
    totalBriefings: number;  // 14-day count across all projects
  };
}
```

---

### `POST /kb/sync`
Trigger KB sync for all projects.

**Request Body:**
```typescript
{
  full?: boolean;  // Force full re-distill (default: false)
}
```

**Response:**
```typescript
{
  success: true;
  message: string;  // Command to run in Commander
  hint: string;
}
```

**Notes:** Returns instructions for running `/knowledge-sync` in Commander. Actual sync requires Claude invocation for doc distillation.

---

### `POST /kb/sync/:projectId`
Trigger KB sync for a specific project.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `projectId` | path | Project ID |

**Request Body:**
```typescript
{
  full?: boolean;  // Force full re-distill
}
```

**Response:**
```typescript
{
  success: true;
  message: string;  // Command to run in Commander
  hint: string;
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
