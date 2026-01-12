# Commander Architecture

Fleet Commander is a meta-agent system for cross-project fleet monitoring. It runs headless Claude jobs, orchestrates hook-based session tracking, and provides durable briefing storage.

---

## Design Philosophy

> **"Bet on model intelligence for meaning, bet on determinism for execution."**

Commander separates concerns:
- **Meaning**: AI models (Opus for queries, Sonnet for analysis) handle semantic understanding
- **Execution**: Deterministic hooks, SQLite storage, and WebSocket streaming handle reliable delivery

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Job Execution System](#job-execution-system)
3. [Hook System](#hook-system)
4. [Status.v5 Schema](#statusv5-schema)
5. [Database Schema](#database-schema)
6. [WebSocket Protocol](#websocket-protocol)
7. [UI Components](#ui-components)
8. [Configuration](#configuration)
9. [Data Flow Diagrams](#data-flow-diagrams)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User's IDE                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Session A  │  │  Session B  │  │  Session C  │  │  Session D  │    │
│  │  (mimesis)  │  │  (api-svc)  │  │  (frontend) │  │  (docs)     │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│                          Hook Events (Python)                           │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Fleet Gateway (port 4452)                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  Unix Socket    │  │  Job Manager    │  │  Outbox Poller          │ │
│  │  (hook events)  │  │  (headless jobs)│  │  (SQLite → WebSocket)   │ │
│  └────────┬────────┘  └────────┬────────┘  └───────────┬─────────────┘ │
│           │                    │                        │               │
│           └────────────────────┴────────────────────────┘               │
│                                │                                         │
│                        Session Store                                     │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Fleet DB (SQLite)                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │  projects   │  │  briefings  │  │ outbox_events│  │    jobs     │   │
│  └─────────────┘  └─────────────┘  └──────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Mimesis UI (port 5173)                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Roster          │  │  Timeline        │  │  Commander Tab       │  │
│  │  (project list)  │  │  (session events)│  │  (Opus conversations)│  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Fleet Gateway** | `packages/daemon/src/gateway/` | WebSocket server, job execution, event streaming |
| **Fleet DB** | `~/.claude/commander/fleet.db` | SQLite persistence for briefings and jobs |
| **Hook Scripts** | `~/.claude/hooks/` | Session lifecycle automation |
| **UI Components** | `packages/ui/src/components/commander/` | Commander interface |

---

## Job Execution System

Commander executes headless Claude jobs using `claude -p --output-format stream-json`.

### Stateful Conversations

Commander maintains a **persistent conversation** across turns using Claude Code's `--continue` flag. This enables:
- Context accumulation across multiple prompts
- Multi-turn investigations ("compare these projects, then propose a plan")
- Fleet awareness via prelude injection

The gateway handles all conversation state internally - the UI just sends prompts.

**Conversation Flow:**
```
First Turn                    Subsequent Turns
    │                             │
    ▼                             ▼
claude -p                    claude -p --continue
    │                             │
    ▼                             ▼
New conversation             Resume from cwd
    │                             │
    ▼                             ▼
Store cursor in SQLite       Build fleet prelude
                                  │
                                  ▼
                             Inject via --append-system-prompt
```

Source: `packages/daemon/src/gateway/handlers/commander-handlers.ts`

### Turn Serialization

Commander processes **one turn at a time**. If a second prompt is sent while a turn is running, it's rejected with a `COMMANDER_BUSY` error. This prevents race conditions and ensures conversation coherence.

```typescript
// From commander-handlers.ts
let commanderTurnInProgress = false;

export async function handleCommanderSend(...): Promise<void> {
  if (commanderTurnInProgress) {
    send(ws, {
      type: "error",
      code: "COMMANDER_BUSY",
      message: "Commander is already processing a turn. Please wait.",
    });
    return;
  }
  commanderTurnInProgress = true;
  try {
    // ... process turn
  } finally {
    commanderTurnInProgress = false;
  }
}
```

The UI should disable the input field while `activeJob` is running.

### Fleet Prelude Injection

Before each Commander turn, the `FleetPreludeBuilder` constructs a context prelude containing:
1. New outbox events since last cursor position
2. Documentation drift warnings from recent briefings
3. Stable system prompt for Commander role

The prelude is injected via `--append-system-prompt` for stable framing.

#### Delta-Only Context Injection

The prelude uses a **cursor-based delta pattern** to avoid re-injecting stale events:

```typescript
// From fleet-prelude-builder.ts
const newEvents = this.outboxRepo.getAfterCursor(lastEventIdSeen, maxEvents);
const newCursor = newEvents.length > 0
  ? newEvents[newEvents.length - 1].eventId
  : lastEventIdSeen;
```

**Cursor flow:**
1. Commander conversation stores `lastOutboxEventIdSeen` in SQLite
2. Each turn queries only events with `event_id > lastOutboxEventIdSeen`
3. After successful job completion, cursor is updated via `conversationRepo.updateLastOutboxEventSeen()`
4. Next turn only sees events that occurred since the last turn

This ensures Commander gets fresh fleet context without accumulating unbounded history.

#### Commander System Prompt

The stable system prompt establishes Commander's role and responsibilities:

```
You are Fleet Commander, an Opus-powered meta-agent monitoring a fleet of
Claude Code workers across multiple projects.

Your responsibilities:
- Track project status, blockers, and cross-project dependencies
- Answer questions about fleet-wide activity
- Coordinate work across projects when needed
- Identify documentation drift and technical debt
- Provide strategic recommendations
```

Source: `packages/daemon/src/gateway/fleet-prelude-builder.ts:94-106`

### Job Types

| Type | Model | Purpose |
|------|-------|---------|
| `commander_turn` | Opus | Cross-project queries from Commander tab (stateful) |
| `worker_task` | Sonnet/Opus | Repo-specific automation tasks |
| `skill_patch` | Sonnet | Skill file updates |
| `doc_patch` | Sonnet | Documentation updates |

Source: `packages/daemon/src/config/fleet.ts:89-94`

### Job Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   queued    │────▶│   running   │────▶│  completed  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   failed    │
                    └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  canceled   │
                    └─────────────┘
```

### Concurrency Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| `MAX_CONCURRENT_JOBS` | 3 | Global job limit |
| `MAX_JOBS_PER_PROJECT` | 1 | Per-project limit |
| `JOB_TIMEOUT_MS` | 300,000 (5 min) | Maximum job duration |

Source: `packages/daemon/src/config/fleet.ts:42-48`

### Job Runner

The `JobRunner` class spawns headless Claude processes with conversation support:

```typescript
// From packages/daemon/src/gateway/job-runner.ts

interface ConversationBinding {
  conversationId: string;        // Our UUID for tracking
  claudeSessionId?: string;      // Claude's session ID (for --resume)
  mode: "first_turn" | "continue" | "resume";
}

interface JobRequest {
  type: string;
  model: "opus" | "sonnet" | "haiku";
  conversation?: ConversationBinding;  // Stateful conversation binding
  request: {
    prompt: string;
    appendSystemPrompt?: string;  // For fleet prelude injection
  };
}

async run(request: JobRequest, onChunk: StreamChunkCallback): Promise<JobResult> {
  // Build CLI arguments
  const args = [
    "-p",                           // Print mode (non-interactive)
    "--output-format", "stream-json",
    "--verbose",                    // REQUIRED for stream-json in print mode
    "--dangerously-skip-permissions", // REQUIRED: headless can't approve interactively
    "--model", model,
  ];

  // Add conversation continuity flags
  if (request.conversation) {
    if (request.conversation.mode === "resume" && request.conversation.claudeSessionId) {
      args.push("--resume", request.conversation.claudeSessionId);
    } else if (request.conversation.mode === "continue") {
      args.push("--continue");  // Continue most recent in cwd
    }
    // first_turn: no flags, starts new conversation
  }

  // Add fleet prelude injection
  if (request.request.appendSystemPrompt) {
    args.push("--append-system-prompt", request.request.appendSystemPrompt);
  }

  // Spawn Claude process
  this.process = spawn(claudePath, args, {
    cwd: request.repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Stream stdout line by line → WebSocket
}
```

### Job Manager

The `JobManager` handles queuing and concurrency:

```typescript
// From packages/daemon/src/gateway/job-manager.ts:59-75

async createJob(request: JobRequest, listener: JobEventListener): Promise<number> {
  // Check per-project limit
  if (request.projectId && this.projectJobs.has(request.projectId)) {
    throw new Error(`Project already has a running job`);
  }

  // Start immediately if under limit
  if (this.running.size < MAX_CONCURRENT_JOBS) {
    return this.startJob(request, listener);
  }

  // Otherwise queue
  this.queue.push({ request, listener, resolve, reject });
}
```

---

## Hook System

Hooks automate session lifecycle management. They run as Python scripts triggered by Claude Code events.

### Hook Configuration

Hooks are configured in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/init-status-v5.py" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/status-working.py" }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/fleet-forward-hook-event.py" }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/emit-hook-event.py" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/status-stop.py" }] },
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/stop-validator.py" }] },
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/finalize-status-v5.py" }] },
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/ingest-status-v5.py" }] }
    ]
  }
}
```

### Hook Lifecycle Events

| Event | Trigger | Purpose |
|-------|---------|---------|
| `SessionStart` | Session begins | Initialize status skeleton, read docs reminder |
| `UserPromptSubmit` | Every prompt | Update working status, suggest skills |
| `PostToolUse` | After each tool | Forward events to gateway for realtime UI |
| `PreCompact` | Before compaction | Register segment ending |
| `Stop` | Session ending | Validate, finalize, ingest to SQLite |

### Complete Hook Reference

#### Session Initialization

**`init-status-v5.py`** - Creates status.v5 skeleton with project identity

Source: `~/.claude/hooks/init-status-v5.py`

- **Trigger**: `SessionStart`
- **Input**: `{ cwd, session_id }`
- **Output**: Creates `.claude/status.v5.<session_id>.md`
- **Actions**:
  1. Extract repo name from cwd
  2. Get git context (remote, branch, base commit)
  3. Generate project_id: `{repo_name}__{8-char-hash}`
  4. Generate task_id: `YYYY-MM-DDTHHMM`
  5. Write YAML frontmatter skeleton

```yaml
---
schema: status.v5
project_id: mimesis__607a7a7c
session_id: abc123
task_id: 2026-01-12T0717Z
status: working
---
```

#### Status Management

**`status-working.py`** - Instructs Claude to write working status

Source: `~/.claude/hooks/status-working.py`

- **Trigger**: `UserPromptSubmit`
- **Purpose**: Remind Claude to update status file with current task

**`status-stop.py`** - Instructs Claude to write completion status

Source: `~/.claude/hooks/status-stop.py`

- **Trigger**: `Stop` (first hook in chain)
- **Purpose**: Remind Claude to finalize status before stopping

**`stop-validator.py`** - Two-phase validation, blocks if incomplete

Source: `~/.claude/hooks/stop-validator.py`

- **Trigger**: `Stop`
- **Exit Codes**:
  - `0` - Allow stop
  - `2` - Block stop (stderr shown to Claude)
- **Logic**:
  - First stop (`stop_hook_active=false`): Show full compliance checklist, block
  - Second stop (`stop_hook_active=true`): Check status file freshness, allow if recent

```
First /stop:
  ┌─────────────────────────────────────────────┐
  │  BLOCKED - Complete these checks:           │
  │  1. CLAUDE.md compliance                    │
  │  2. Documentation updates                   │
  │  3. Update MEMORIES.md                      │
  │  4. Change-specific tests (if detected)     │
  │  5. Commit and push                         │
  └─────────────────────────────────────────────┘

Second /stop (after completing checks):
  ┌─────────────────────────────────────────────┐
  │  Check status file freshness                │
  │  If < 5 min old → ALLOW                     │
  │  If stale → BLOCK again                     │
  └─────────────────────────────────────────────┘
```

#### AI Analysis

**`finalize-status-v5.py`** - Invokes headless Sonnet for semantic classification

Source: `~/.claude/hooks/finalize-status-v5.py`

- **Trigger**: `Stop` (when `stop_hook_active=true`)
- **Actions**:
  1. Get git diff summary
  2. Invoke `claude -p --model sonnet --output-format json`
  3. Sonnet analyzes changes and returns:
     - `impact_level`: trivial | minor | moderate | major
     - `broadcast_level`: silent | mention | highlight
     - `doc_drift_risk`: low | medium | high
     - `summary`, `technical_notes`
     - `files_touched`, `docs_touched`, `blockers`, `next_steps`
  4. Update status.v5 file with Sonnet's analysis

#### Data Ingestion

**`ingest-status-v5.py`** - POSTs finalized status to daemon for SQLite storage

Source: `~/.claude/hooks/ingest-status-v5.py`

- **Trigger**: `Stop` (final hook, when `stop_hook_active=true`)
- **Endpoint**: `POST http://127.0.0.1:4451/api/v1/fleet/ingest`
- **Payload**: `{ content: <status file>, repoName, repoRoot }`
- **Result**: Briefing inserted into SQLite, outbox event created

#### Event Forwarding

**`emit-hook-event.py`** - HTTP POST to daemon for segment tracking

Source: `~/.claude/hooks/emit-hook-event.py`

- **Trigger**: `PreCompact`, `SessionStart:compact`
- **Purpose**: Notify daemon of session lifecycle events

**`fleet-forward-hook-event.py`** - Unix socket for realtime tool events

Source: `~/.claude/hooks/fleet-forward-hook-event.py`

- **Trigger**: `PostToolUse`
- **Socket**: `~/.claude/commander/gateway.sock`
- **Payload**: Tool event JSON with attached `fleet_session_id`
- **Purpose**: Enable realtime Timeline updates in UI

```python
# From fleet-forward-hook-event.py:53-60
sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.connect(str(socket_path))
message = json.dumps(payload) + "\n"
sock.sendall(message.encode("utf-8"))
```

#### Segment Tracking

**`session-compact.py`** - Writes marker file on compaction

Source: `~/.claude/hooks/session-compact.py`

- **Trigger**: `SessionStart:compact`
- **Purpose**: Track when session context is compacted for segment chain analysis

#### Developer Assistance

**`read-docs-trigger.py`** - Reminds Claude to read documentation

Source: `~/.claude/hooks/read-docs-trigger.py`

- **Trigger**: `UserPromptSubmit`
- **Purpose**: Inject reminder to read `docs/index.md`, `CLAUDE.md`, `.claude/MEMORIES.md`

**`skill-reminder.py`** - Suggests relevant skills

Source: `~/.claude/hooks/skill-reminder.py`

- **Trigger**: `UserPromptSubmit`
- **Purpose**: Suggest skills based on prompt content

---

## Status.v5 Schema

The status.v5 file format uses YAML frontmatter with a markdown body.

### File Location

```
.claude/status.v5.<session_id>.md
```

### Schema Structure

```yaml
---
schema: status.v5

# Identity Section (hook-authored)
project_id: mimesis__607a7a7c      # {repo_name}__{8-char-hash}
repo_name: mimesis
repo_root: /Users/dev/mimesis
git_remote: git@github.com:user/mimesis.git
branch: main

# Session Section (hook-authored)
session_id: abc123def456
task_id: 2026-01-12T0717Z          # YYYY-MM-DDTHHMM format
status: working                     # working|completed|blocked|failed
started_at: 2026-01-12T07:17:00Z
ended_at: 2026-01-12T08:30:00Z     # Set by finalize hook

# Semantic Section (Sonnet-authored)
impact_level: moderate              # trivial|minor|moderate|major
broadcast_level: mention            # silent|mention|highlight
doc_drift_risk: medium              # low|medium|high

# Traceability Section
base_commit: abc1234                # HEAD at session start
head_commit: def5678                # HEAD at session end

# Structured Lists (Sonnet-authored)
blockers:
  - "Waiting for API response from backend team"
next_steps:
  - "Implement error handling"
  - "Add unit tests"
docs_touched:
  - "docs/api/endpoints.md"
files_touched:
  - "src/api/routes.ts"
  - "src/lib/client.ts"
---

# Briefing

## Summary
Implemented new API endpoint for user preferences with validation.

## Technical Notes
Used Zod for request validation. Added rate limiting middleware.
```

### Field Descriptions

| Section | Field | Author | Description |
|---------|-------|--------|-------------|
| Identity | `project_id` | Hook | Stable identifier: `{repo_name}__{hash}` |
| Identity | `repo_name` | Hook | Directory name |
| Identity | `git_remote` | Hook | Origin remote URL |
| Session | `task_id` | Hook | Timestamp-based task identifier |
| Session | `status` | Hook/Sonnet | Session outcome |
| Semantic | `impact_level` | Sonnet | Change significance |
| Semantic | `broadcast_level` | Sonnet | Notification urgency |
| Semantic | `doc_drift_risk` | Sonnet | Documentation staleness risk |

---

## Database Schema

Fleet Commander uses SQLite with Drizzle ORM for persistence.

Source: `packages/daemon/src/fleet-db/schema.ts`

### Tables

#### projects

Repo identity and status.

```sql
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,     -- {repo_name}__{8-char-hash}
  repo_name TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  git_remote TEXT,
  status TEXT DEFAULT 'active',    -- active|archived
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### briefings

Durable history of session completions.

```sql
CREATE TABLE briefings (
  briefing_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  session_id TEXT,
  task_id TEXT,
  status TEXT NOT NULL,            -- completed|blocked|failed|waiting_for_input
  started_at TEXT,
  ended_at TEXT,
  impact_level TEXT,               -- trivial|minor|moderate|major
  broadcast_level TEXT,            -- silent|mention|highlight
  doc_drift_risk TEXT,             -- low|medium|high
  base_commit TEXT,
  head_commit TEXT,
  branch TEXT,
  blockers_json TEXT,              -- JSON array
  next_steps_json TEXT,            -- JSON array
  docs_touched_json TEXT,          -- JSON array
  files_touched_json TEXT,         -- JSON array
  raw_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, session_id, task_id, ended_at)
);
```

#### outbox_events

Push queue for realtime delivery.

```sql
CREATE TABLE outbox_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                -- ISO timestamp
  type TEXT NOT NULL,              -- briefing_added|skill_updated|job_completed|error
  project_id TEXT,
  briefing_id INTEGER,
  payload_json TEXT NOT NULL,
  delivered INTEGER DEFAULT 0      -- boolean
);
```

#### jobs

Headless job queue and Commander conversation history.

```sql
CREATE TABLE jobs (
  job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_created TEXT NOT NULL,
  ts_started TEXT,
  ts_finished TEXT,
  type TEXT NOT NULL,              -- worker_task|skill_patch|doc_patch|commander_turn
  project_id TEXT,
  repo_root TEXT,
  model TEXT NOT NULL,             -- opus|sonnet|haiku
  status TEXT NOT NULL,            -- queued|running|completed|failed|canceled
  request_json TEXT NOT NULL,
  stream_chunks_json TEXT,         -- Full stream output for replay
  result_json TEXT,
  error TEXT
);
```

#### conversations

Stateful conversation sessions for Commander.

```sql
CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,     -- Our UUID for tracking
  kind TEXT NOT NULL,                   -- 'commander' (future: 'worker_session')
  cwd TEXT NOT NULL,                    -- Working directory (e.g., ~/.claude/commander)
  model TEXT NOT NULL,                  -- 'opus' for Commander
  claude_session_id TEXT,               -- Claude's session ID (captured from first turn)
  last_outbox_event_id_seen INTEGER DEFAULT 0,  -- Cursor for fleet prelude
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

The Commander conversation is a singleton - there's only one Commander conversation at a time, stored with `kind='commander'`. The `last_outbox_event_id_seen` tracks which fleet events have been injected, enabling delta-only context injection.

Source: `packages/daemon/src/fleet-db/conversation-repo.ts`

#### ConversationRepo API

The repository provides these methods for conversation management:

```typescript
// From packages/daemon/src/fleet-db/conversation-repo.ts

get(conversationId: string): Conversation | undefined
// Fetch a conversation by ID

getByKind(kind: ConversationKind): Conversation | undefined
// Find conversation by kind (e.g., 'commander')

getOrCreateCommander(): Conversation
// Singleton pattern - returns existing Commander or creates new one
// This is the primary entry point for Commander operations

create(params: CreateConversationParams): Conversation
// Create a new conversation record

updateClaudeSessionId(conversationId: string, claudeSessionId: string): void
// Store Claude's session ID after first turn completes
// Enables --resume for subsequent turns

updateLastOutboxEventSeen(conversationId: string, eventId: number): void
// Update cursor after successful job completion
// Prevents re-injecting events in next prelude

clearClaudeSessionId(conversationId: string): void
// Clear session ID (used internally by reset)

resetCommander(): void
// Clear Commander conversation state for fresh start
// Note: Only clears claudeSessionId, not the entire record
```

**Important**: `resetCommander()` only clears the `claudeSessionId` field. The conversation record persists, preserving the `last_outbox_event_id_seen` cursor.

### Entity Relationships

```
┌─────────────┐       ┌─────────────┐
│  projects   │◄──────│  briefings  │
│             │  1:N  │             │
└─────────────┘       └──────┬──────┘
                             │
                             │ FK
                             ▼
                      ┌─────────────┐
                      │outbox_events│
                      └─────────────┘
```

---

## WebSocket Protocol

The Fleet Gateway communicates via WebSocket on port 4452.

Source: `packages/daemon/src/gateway/protocol.ts`

### Client → Gateway Messages

#### job.create

Start a headless job.

```typescript
{
  type: "job.create",
  job: {
    type: "commander_turn",        // Job type
    project_id?: string,           // Optional project context
    repo_root?: string,            // Working directory
    model: "opus" | "sonnet" | "haiku",
    request: {
      prompt: string,              // User prompt
      system_prompt?: string,
      json_schema?: string,        // Output schema
      max_turns?: number,
      disallowed_tools?: string[],
    }
  }
}
```

#### job.cancel

Cancel a running job.

```typescript
{
  type: "job.cancel",
  job_id: number
}
```

#### fleet.subscribe

Subscribe to fleet events with replay from event ID.

```typescript
{
  type: "fleet.subscribe",
  from_event_id: number
}
```

#### commander.send

Send a prompt to Commander (stateful Opus conversation). The gateway handles all conversation state internally.

```typescript
{
  type: "commander.send",
  prompt: string
}
```

The gateway will:
1. Get or create the Commander conversation
2. Build fleet prelude from outbox events
3. Create a job with conversation binding
4. Stream responses via `job.stream` messages
5. Update outbox cursor on completion

#### commander.reset

Reset the Commander conversation to start fresh.

```typescript
{
  type: "commander.reset"
}
```

This clears the Commander conversation state. The next `commander.send` will start a new conversation.

### Gateway → Client Messages

#### job.started

Job began executing.

```typescript
{
  type: "job.started",
  job_id: number,
  project_id?: string
}
```

#### job.stream

Streaming output chunk from Claude.

```typescript
{
  type: "job.stream",
  job_id: number,
  chunk: StreamJsonChunk  // Claude stream-json format
}
```

#### job.completed

Job finished (success or failure).

```typescript
{
  type: "job.completed",
  job_id: number,
  ok: boolean,
  result?: {
    text: string,
    thinking: string,
    toolUses: Array<{ id, name, input }>
  },
  error?: string
}
```

#### fleet.event

Fleet event from outbox.

```typescript
{
  type: "fleet.event",
  event_id: number,
  ts: string,
  event: {
    type: "briefing_added" | "skill_updated" | "job_completed" | "error",
    project_id?: string,
    briefing_id?: number,
    data?: unknown
  }
}
```

### Stream JSON Chunk Format

Claude CLI's `--output-format stream-json` produces **JSONL log entries** (one per line), not API-level stream events. The UI handles both formats for compatibility.

#### CLI JSONL Format (Primary)

Each line from `claude -p --output-format stream-json` is a session log entry:

```typescript
// Assistant message with content blocks
{
  type: "assistant",
  message: {
    content: [
      { type: "text", text: "Hello..." },
      { type: "thinking", thinking: "Let me consider..." },
      { type: "tool_use", id: "toolu_123", name: "Read", input: { file_path: "..." } }
    ]
  }
}

// System messages
{ type: "system", subtype: "turn_duration", ... }

// User prompts
{ type: "user", message: { content: "..." } }

// Results
{ type: "result", ... }
```

#### API Stream Format (Legacy Compatibility)

The UI also handles API-level stream events for future compatibility:

```typescript
interface StreamJsonChunk {
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
  };
  delta?: {
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
}
```

#### UI Parsing

`CommanderTab.tsx` uses `parseStreamEvents()` which handles both formats:

```typescript
// From CommanderTab.tsx:141-186
if (event.type === "assistant") {
  // CLI JSONL format - extract from message.content array
  const content = event.message?.content;
  for (const block of content) {
    if (block.type === "text") text += block.text;
    if (block.type === "thinking") thinking += block.thinking;
    if (block.type === "tool_use") toolUses.push(block);
  }
} else if (event.type === "content_block_delta") {
  // API stream format - extract from delta
  text += event.delta?.text ?? "";
  thinking += event.delta?.thinking ?? "";
}
```

---

## UI Components

Commander UI is built with React and lives in `packages/ui/src/components/commander/`.

### Component Hierarchy

```
CommanderTab
├── CommanderHistory (placeholder for past conversations)
├── CommanderStreamDisplay
│   ├── Thinking (collapsible)
│   ├── Text content
│   └── Tool uses
└── CommanderInput
    ├── Textarea
    └── Submit/Cancel buttons
```

### CommanderTab

Main container for Commander conversations.

Source: `packages/ui/src/components/commander/CommanderTab.tsx`

```typescript
interface CommanderTabProps {
  activeJob: JobState | null;      // Current job state
  onSendPrompt: (prompt: string) => void;  // Uses gateway.sendCommanderPrompt
  onCancelJob: () => void;
  onResetConversation: () => void;  // Uses gateway.resetCommander
}
```

Features:
- Header with Opus branding and "New Conversation" reset button
- Content area with history and active stream
- Input area for new prompts
- Status indicators (running/completed/failed)

The component is prompt-only - the gateway handles all conversation state internally.

### CommanderStreamDisplay

Renders streaming Commander output.

Source: `packages/ui/src/components/commander/CommanderStreamDisplay.tsx`

```typescript
interface CommanderStreamDisplayProps {
  content: {
    text: string;
    thinking: string;
    toolUses: Array<{ id, name, input }>;
  } | null;
  isRunning: boolean;
  error?: string;
}
```

Features:
- Collapsible thinking display
- Streaming text output
- Tool use visualization
- Error states

### CommanderInput

Prompt composer for Commander.

Source: `packages/ui/src/components/commander/CommanderInput.tsx`

Features:
- Multi-line textarea
- Submit button (triggers `job.create`)
- Cancel button (triggers `job.cancel`)
- Disabled state during job execution

---

## Configuration

### File Paths

| Path | Purpose |
|------|---------|
| `~/.claude/commander/` | Base directory for Commander data |
| `~/.claude/commander/fleet.db` | SQLite database |
| `~/.claude/commander/gateway.sock` | Unix socket for hook IPC |
| `~/.claude/commander/sessions/` | Session PID files (crash recovery) |
| `~/.claude/commander/schemas/` | JSON schemas for Sonnet output |

Source: `packages/daemon/src/config/fleet.ts:10-21`

### Network Ports

| Port | Service |
|------|---------|
| 4451 | REST API (Hono) |
| 4452 | Gateway WebSocket |
| 5173 | UI dev server |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `FLEET_INGEST_URL` | `http://127.0.0.1:4451/api/v1/fleet/ingest` | Ingestion endpoint |
| `FLEET_SESSION_ID` | (injected by gateway) | Session tracking |
| `FLEET_GATEWAY_SOCKET` | `~/.claude/commander/gateway.sock` | Hook IPC socket |

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_CONCURRENT_JOBS` | 3 | Global job limit |
| `MAX_JOBS_PER_PROJECT` | 1 | Per-project job limit |
| `JOB_TIMEOUT_MS` | 300,000 | 5-minute job timeout |
| `RING_BUFFER_SIZE_BYTES` | 20MB | Per-session event buffer |
| `OUTBOX_POLL_INTERVAL_MS` | 1,000 | Outbox delivery interval |
| `STATUS_FILE_MAX_AGE_SECONDS` | 300 | 5-minute status freshness |

---

## Data Flow Diagrams

### Session Start Flow

```
Claude Code starts
        │
        ▼
SessionStart event
        │
        ├──▶ init-status-v5.py
        │         │
        │         ▼
        │    Create .claude/status.v5.<session_id>.md
        │         │
        │         ▼
        │    Print <system-reminder> with project_id, task_id
        │
        └──▶ read-docs-trigger echo
                  │
                  ▼
             Print reminder to read docs
```

### Prompt Handling Flow

```
User submits prompt
        │
        ▼
UserPromptSubmit event
        │
        ├──▶ status-working.py → Remind to update status
        ├──▶ read-docs-trigger.py → Remind to read docs
        └──▶ skill-reminder.py → Suggest skills
```

### Tool Event Flow

```
Claude executes tool
        │
        ▼
PostToolUse event
        │
        ▼
fleet-forward-hook-event.py
        │
        ▼
Unix socket → gateway.sock
        │
        ▼
Fleet Gateway
        │
        ▼
WebSocket → UI Timeline
```

### Stop Hook Two-Phase Flow

```
/stop (first time)
        │
        ▼
status-stop.py → Remind to finalize
        │
        ▼
stop-validator.py (stop_hook_active=false)
        │
        ▼
EXIT 2 (BLOCK) with full checklist
        │
        ▼
Claude completes requirements:
  - Updates status file
  - Commits changes
  - Pushes to remote
        │
        ▼
/stop (second time)
        │
        ▼
status-stop.py → (reminder again)
        │
        ▼
stop-validator.py (stop_hook_active=true)
        │
        ├──▶ Check status file freshness
        │         │
        │         ├── Stale → EXIT 2 (BLOCK)
        │         │
        │         └── Fresh → Continue
        │
        ▼
finalize-status-v5.py
        │
        ├──▶ Get git diff
        ├──▶ Invoke Sonnet for analysis
        └──▶ Update status.v5 with semantic fields
        │
        ▼
ingest-status-v5.py
        │
        ├──▶ POST to /api/v1/fleet/ingest
        └──▶ Create briefing in SQLite
        │
        ▼
EXIT 0 (ALLOW) → Session ends
```

### Job Execution Flow

```
UI: User types prompt in Commander tab
        │
        ▼
WebSocket: job.create message
        │
        ▼
JobManager.createJob()
        │
        ├──▶ Check per-project limit
        ├──▶ Check global limit
        │         │
        │         ├── Under limit → Start immediately
        │         │
        │         └── At limit → Queue job
        │
        ▼
JobRunner.run()
        │
        ├──▶ spawn("claude", ["-p", "--output-format", "stream-json"])
        ├──▶ Write prompt to stdin
        └──▶ Stream stdout to WebSocket
        │
        ▼
WebSocket: job.stream messages (per chunk)
        │
        ▼
UI: CommanderStreamDisplay renders text/thinking/tools
        │
        ▼
Process exits
        │
        ▼
JobManager.executeJob() completes
        │
        ├──▶ Store stream chunks in SQLite
        └──▶ Send job.completed message
        │
        ▼
UI: Show final result
```

---

## Error Handling

### Commander-Specific Errors

| Error Code | Trigger | Client Action |
|------------|---------|---------------|
| `COMMANDER_BUSY` | Second prompt sent while turn in progress | Disable input, wait for completion |

Example error response:
```typescript
{
  type: "error",
  code: "COMMANDER_BUSY",
  message: "Commander is already processing a turn. Please wait."
}
```

### Job Errors

Jobs can fail with these conditions:

| Condition | Error |
|-----------|-------|
| Timeout (5 min) | `Job timed out after 300s` |
| Process exit | `Process exited with code <N>` |
| Spawn failure | `Command not found: claude` |

Error responses are sent via `job.completed` with `ok: false`:
```typescript
{
  type: "job.completed",
  job_id: 123,
  ok: false,
  error: "Job timed out after 300s"
}
```

---

## Related Documentation

- [Gateway Architecture](gateway.md) - WebSocket server details
- [Gateway Protocol](../api/gateway-protocol.md) - Complete message reference
- [Session Lifecycle](session-lifecycle.md) - Session states and compaction
- [Fleet DB Schema](fleet-db.md) - Database details
- [REST API Endpoints](../api/endpoints.md) - HTTP endpoint reference
- [Configuration Reference](configuration-reference.md) - All config options
