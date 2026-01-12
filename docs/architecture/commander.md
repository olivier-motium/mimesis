# Commander Architecture

Fleet Commander is a meta-agent system for cross-project fleet monitoring. It runs a **persistent PTY-based Claude session**, orchestrates hook-based session tracking, and provides durable briefing storage.

---

## Design Philosophy

> **"Bet on model intelligence for meaning, bet on determinism for execution."**

Commander separates concerns:
- **Meaning**: AI models (Opus for queries, Sonnet for analysis) handle semantic understanding
- **Execution**: Deterministic hooks, SQLite storage, and WebSocket streaming handle reliable delivery

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [PTY Session System](#pty-session-system)
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
│  ┌─────────────────┐  ┌─────────────────────────────────────────────┐  │
│  │  Unix Socket    │  │  Commander Session Manager                   │  │
│  │  (hook events)  │  │  (PTY + Prompt Queue + Status Detection)     │  │
│  └────────┬────────┘  └────────────────────┬────────────────────────┘  │
│           │                                 │                           │
│           │           ┌─────────────────────┴───────────────┐          │
│           │           │                                     │          │
│           │    ┌──────▼──────┐  ┌──────────────┐  ┌────────▼────────┐ │
│           │    │  PTY Bridge │  │ Session Store│  │ Outbox Poller   │ │
│           │    │  (stdin/out)│  │  (tracking)  │  │ (SQLite → WS)   │ │
│           │    └──────┬──────┘  └──────────────┘  └─────────────────┘ │
│           │           │                                                │
│           └───────────┴────────────────────────────────────────────────┘
└────────────────────────────────────┼───────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Fleet DB (SQLite)                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │  projects   │  │  briefings  │  │ outbox_events│  │conversations│   │
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
| **Fleet Gateway** | `packages/daemon/src/gateway/` | WebSocket server, PTY management, event streaming |
| **Commander Session** | `packages/daemon/src/gateway/commander-session.ts` | PTY lifecycle, prompt queue, status detection |
| **Fleet DB** | `~/.claude/commander/fleet.db` | SQLite persistence for briefings and conversations |
| **Hook Scripts** | `~/.claude/hooks/` | Session lifecycle automation |
| **UI Components** | `packages/ui/src/components/commander/` | Commander interface |

---

## PTY Session System

Commander uses a **persistent PTY-based Claude session** for natural conversation flow. This provides several advantages over headless jobs:

| Headless (`claude -p`) | PTY (`claude`) |
|------------------------|----------------|
| No hooks fire | All hooks fire naturally |
| New process per prompt | Persistent session |
| `--continue` for continuity | Native conversation state |
| No tool approvals possible | Could show approvals in UI |
| Can't interrupt mid-response | SIGINT works naturally |
| BUSY rejection on concurrent prompts | Natural prompt queuing |

### PTY-Based Conversation

Commander maintains a **persistent interactive PTY session** running `claude`. This enables:
- Context accumulation across multiple prompts (native Claude behavior)
- Multi-turn investigations ("compare these projects, then propose a plan")
- Fleet awareness via prelude injection in prompts
- All Claude hooks firing naturally (PostToolUse, etc.)
- Natural prompt queuing when Commander is busy

The gateway handles all conversation state internally - the UI just sends prompts.

**Conversation Flow:**
```
First Prompt                  Subsequent Prompts
    │                             │
    ▼                             ▼
Create PTY (claude)          Reuse existing PTY
    │                             │
    ▼                             ▼
Watch for session file       Check status
    │                             │
    ▼                             ▼
Write prompt to stdin        Queue if busy, else write
    │                             │
    ▼                             ▼
Store session ID             Inject fleet prelude
                                  │
                                  ▼
                             via <system-reminder> in prompt
```

Source: `packages/daemon/src/gateway/commander-session.ts`

### Prompt Queue and Status Detection

Commander queues prompts when busy instead of rejecting. The `CommanderSessionManager` uses the existing `SessionStore` infrastructure to detect when Commander is ready.

```typescript
// From commander-session.ts
export class CommanderSessionManager extends EventEmitter {
  private ptySessionId: string | null = null;
  private claudeSessionId: string | null = null;
  private promptQueue: PromptQueueItem[] = [];
  private status: CommanderStatus = "idle";

  async sendPrompt(prompt: string): Promise<void> {
    await this.ensureSession();

    // If working, queue the prompt
    if (this.status === "working") {
      this.promptQueue.push({ prompt, queuedAt: new Date().toISOString() });
      this.emitState();
      return;
    }

    // Otherwise, send immediately
    await this.writePrompt(prompt);
  }

  // Called when SessionStore detects Commander is ready
  private onStatusChange(status: UIStatus): void {
    if (status === "waiting_for_input" || status === "idle") {
      this.drainQueue();
    }
  }

  private drainQueue(): void {
    const next = this.promptQueue.shift();
    if (next) {
      this.writePrompt(next.prompt);
    }
  }
}
```

**Queue behavior:**
1. User sends prompt → If busy, push to `promptQueue` and return immediately
2. UI shows queue count: "Commander is working (2 queued)..."
3. When status changes to `waiting_for_input`, drain next prompt from queue
4. Repeat until queue is empty

### Fleet Prelude Injection

Before each Commander prompt, the `FleetPreludeBuilder` constructs a context prelude containing:
1. New outbox events since last cursor position
2. Documentation drift warnings from recent briefings
3. Stable system prompt for Commander role (first turn only)

The prelude is injected via `<system-reminder>` blocks in the prompt itself:

```typescript
// From commander-session.ts
async writePrompt(prompt: string): Promise<void> {
  const prelude = this.fleetPreludeBuilder.build({
    lastEventIdSeen: this.lastOutboxEventIdSeen,
    maxEvents: 50,
    includeDocDriftWarnings: true,
  });

  let fullPrompt = prompt;

  // Inject fleet context as system reminder
  if (prelude.hasActivity) {
    fullPrompt = `<system-reminder>\n${prelude.fleetDelta}\n</system-reminder>\n\n${prompt}`;
  }

  // On first turn, also inject role prompt
  if (this.isFirstTurn) {
    fullPrompt = `<system-reminder>\n${prelude.systemPrompt}\n</system-reminder>\n\n${fullPrompt}`;
    this.isFirstTurn = false;
  }

  this.ptyBridge.write(this.ptySessionId, fullPrompt + "\n");
}
```

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
2. Each prompt queries only events with `event_id > lastOutboxEventIdSeen`
3. After successful prompt completion, cursor is updated
4. Next prompt only sees events that occurred since the last prompt

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

### Session ID Capture

Commander captures Claude's session ID by watching for the JSONL file creation:

```typescript
// From commander-session.ts
async ensureSession(): Promise<void> {
  // 1. Create PTY
  const ptyInfo = await this.ptyBridge.create({
    projectId: COMMANDER_PROJECT_ID,
    cwd: COMMANDER_CWD,
    command: ["claude"],
    env: { FLEET_SESSION_ID: "commander" },
  });

  this.ptySessionId = ptyInfo.sessionId;

  // 2. Watch for Claude session file to get session ID
  // Claude creates: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
  const sessionsDir = getClaudeProjectsDir(COMMANDER_CWD);

  const watcher = chokidar.watch(`${sessionsDir}/*.jsonl`, { ignoreInitial: false });
  watcher.on("add", (filePath) => {
    this.claudeSessionId = path.basename(filePath, ".jsonl");
    // Store in DB for persistence
    this.conversationRepo.updateClaudeSessionId(
      this.conversationId,
      this.claudeSessionId
    );
    watcher.close();
  });
}
```

### PTY Session Lifecycle

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│    idle     │────▶│  waiting_for_input  │────▶│   working   │
│ (no PTY)    │     │  (PTY ready)        │     │ (processing)│
└─────────────┘     └─────────────────────┘     └──────┬──────┘
       ▲                      ▲                        │
       │                      │                        │
       │                      └────────────────────────┘
       │                         (prompt complete)
       │
       │            ┌─────────────┐
       └────────────│   reset     │
                    │ (kill PTY)  │
                    └─────────────┘
```

### Commander Session Manager

The `CommanderSessionManager` class manages the PTY lifecycle:

```typescript
// From packages/daemon/src/gateway/commander-session.ts

export class CommanderSessionManager extends EventEmitter {
  // PTY session tracking
  private ptySessionId: string | null = null;
  private claudeSessionId: string | null = null;
  private status: CommanderStatus = "idle";

  // Prompt queue
  private promptQueue: PromptQueueItem[] = [];

  // Event cursor
  private lastOutboxEventIdSeen: number = 0;

  constructor(deps: CommanderSessionDeps) { ... }

  // Send prompt (queues if busy)
  async sendPrompt(prompt: string): Promise<void>;

  // Reset conversation (kills PTY, clears queue)
  async reset(): Promise<void>;

  // Cancel current operation (sends SIGINT)
  async cancel(): Promise<void>;

  // Get current state for UI
  getState(): CommanderState;

  // Initialize on daemon start (restore from DB)
  async initialize(): Promise<void>;

  // Shutdown (cleanup)
  async shutdown(): Promise<void>;
}

type CommanderStatus = "idle" | "working" | "waiting_for_input";

interface CommanderState {
  status: CommanderStatus;
  ptySessionId: string | null;
  claudeSessionId: string | null;
  queuedPrompts: number;
  isFirstTurn: boolean;
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
1. Ensure PTY session exists (create if needed)
2. If status is "working", queue the prompt and return
3. Build fleet prelude from outbox events
4. Write prompt with prelude to PTY stdin
5. Emit `commander.state` with updated status

#### commander.reset

Reset the Commander conversation to start fresh.

```typescript
{
  type: "commander.reset"
}
```

This kills the PTY session and clears the prompt queue. The next `commander.send` will start a new session.

#### commander.cancel

Cancel the current Commander operation (sends SIGINT to PTY).

```typescript
{
  type: "commander.cancel"
}
```

This sends SIGINT to interrupt Commander mid-response. Queued prompts remain in the queue.

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

#### commander.state

Commander state update (sent on connect and on state changes).

```typescript
{
  type: "commander.state",
  state: {
    status: "idle" | "working" | "waiting_for_input",
    ptySessionId: string | null,
    claudeSessionId: string | null,
    queuedPrompts: number,
    isFirstTurn: boolean
  }
}
```

#### commander.queued

Prompt was queued because Commander is busy.

```typescript
{
  type: "commander.queued",
  position: number  // Queue position (1-indexed)
}
```

#### commander.ready

Commander is ready for input (queue drained).

```typescript
{
  type: "commander.ready"
}
```

#### commander.stdout

Commander PTY output (streaming to all clients).

```typescript
{
  type: "commander.stdout",
  session_id: string,
  seq: number,
  event: SessionEvent  // Usually { type: "stdout", data: string, timestamp: string }
}
```

Unlike regular session events that only go to attached clients, Commander stdout is broadcast to ALL connected clients. This enables the Commander UI to display streaming output without explicit session attachment.

Source: `packages/daemon/src/gateway/protocol.ts:298-303`

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
├── Header (status, queue count, reset button)
├── CommanderHistory (placeholder for past conversations)
├── Session info (session ID, first turn indicator)
├── Streaming output display
│   ├── Header with Terminal icon
│   ├── "Streaming..." indicator (when working)
│   └── Pre-formatted output (ANSI-stripped)
├── Working indicator (when processing, no output yet)
└── CommanderInput
    ├── Textarea (queue-aware placeholder)
    └── Submit/Cancel buttons
```

### CommanderTab

Main container for Commander conversations.

Source: `packages/ui/src/components/commander/CommanderTab.tsx`

```typescript
interface CommanderTabProps {
  commanderState: CommanderState;               // PTY session state
  commanderEvents: SequencedSessionEvent[];     // PTY output events for streaming display
  onSendPrompt: (prompt: string) => void;       // Uses gateway.sendCommanderPrompt
  onCancel: () => void;                         // Uses gateway.cancelCommander (SIGINT)
  onResetConversation: () => void;              // Uses gateway.resetCommander
}

interface CommanderState {
  status: "idle" | "working" | "waiting_for_input";
  ptySessionId: string | null;
  claudeSessionId: string | null;
  queuedPrompts: number;
  isFirstTurn: boolean;
}
```

Features:
- Header with Opus branding and "New Conversation" reset button
- Queue indicator showing number of pending prompts
- Status indicator (Working / Ready / Idle)
- Session info showing Claude session ID
- Streaming output display panel (when content available)
- Working indicator with queue count (when no output yet)
- Empty state when no PTY session exists

### Streaming Output Display

CommanderTab includes a real-time output panel showing PTY stdout:

- **Output panel**: Shows `Commander Output` header with streaming indicator
- **Auto-scroll**: Automatically scrolls to bottom as new content arrives
- **ANSI stripping**: Raw PTY output contains terminal escape codes that are stripped before rendering

```typescript
// ANSI escape code stripping
// Comprehensive pattern handles: CSI sequences, OSC sequences, DEC private modes, character sets
// Source: packages/ui/src/components/commander/CommanderTab.tsx:19-25
const ANSI_REGEX = /\x1b\[[?>=!]?[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012UK]|\x1b[78DEHM]|\x1b=|\x1b>/g;
function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

// Extract and clean stdout from events
// Source: packages/ui/src/components/commander/CommanderTab.tsx:58-64
const stdoutContent = useMemo(() => {
  const rawContent = commanderEvents
    .filter((e) => e.type === "stdout" && e.data)
    .map((e) => e.data)
    .join("");
  return stripAnsi(rawContent);
}, [commanderEvents]);
```

The streaming display:
1. Filters `commanderEvents` for `stdout` type events
2. Joins all `data` fields into a single string
3. Strips ANSI escape codes for clean rendering
4. Renders in a monospace `<pre>` element with auto-scroll

### CommanderInput

Prompt composer for Commander.

Source: `packages/ui/src/components/commander/CommanderInput.tsx`

```typescript
interface CommanderInputProps {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  isRunning: boolean;
  queuedPrompts?: number;
}
```

Features:
- Multi-line textarea with auto-resize
- Queue-aware placeholder text:
  - When idle: "Ask Commander about your fleet..."
  - When working: "Commander is thinking... Type to queue, Esc to cancel"
  - When working with queue: "Commander is working (N queued)..."
- Submit button (sends prompt, allows submission even when running to queue)
- Cancel button (triggers SIGINT via `commander.cancel`)
- Enter to submit, Shift+Enter for newline, Escape to cancel

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

### Commander Prompt Flow

```
UI: User types prompt in Commander tab
        │
        ▼
WebSocket: commander.send message
        │
        ▼
CommanderSessionManager.sendPrompt()
        │
        ├──▶ ensureSession() (create PTY if needed)
        │         │
        │         └──▶ ptyBridge.create() → spawn("claude")
        │         └──▶ Watch for session JSONL file
        │
        ├──▶ Check status
        │         │
        │         ├── working → Queue prompt, emit commander.state
        │         │
        │         └── waiting → Continue
        │
        ▼
writePrompt()
        │
        ├──▶ Build fleet prelude (delta events)
        ├──▶ Inject <system-reminder> blocks
        └──▶ Write to PTY stdin
        │
        ▼
PTY stdout → SessionStore → status = "working"
        │
        ▼
WebSocket: commander.state { status: "working" }
        │
        ▼
Claude processes prompt...
        │
        ▼
SessionStore detects idle → status = "waiting_for_input"
        │
        ▼
CommanderSessionManager.onStatusChange()
        │
        ├──▶ drainQueue() if prompts pending
        └──▶ Emit commander.state { status: "waiting_for_input" }
        │
        ▼
UI: Commander ready for next prompt
```

### Commander Stdout Streaming Flow

```
PTY stdout data
        │
        ▼
pty-session-handlers.ts:handlePtyOutput()
        │
        ├──▶ Regular sessions: Send to attached clients only
        │
        └──▶ Commander session detected?
                  │
                  ▼
             gateway-server.ts: Check isCommanderSession()
                  │
                  ▼
             Broadcast commander.stdout to ALL clients
                  │
                  ▼
             UI: handleCommanderStdout() in gateway-handlers.ts
                  │
                  ▼
             Append to commanderEvents[], maintain sequence order
                  │
                  ▼
             CommanderTab: Extract stdout, strip ANSI, render
```

Key distinction: Unlike regular session events that only go to attached clients,
Commander stdout is broadcast to ALL connected clients via the `commander.stdout`
message type. This enables the Commander UI to display streaming output without
explicit session attachment.

---

## Error Handling

### Commander Queue Behavior

Unlike job-based execution, PTY-based Commander **queues prompts** instead of rejecting them:

| Scenario | Behavior |
|----------|----------|
| Prompt sent while idle | Send immediately to PTY |
| Prompt sent while working | Queue prompt, show count in UI |
| Queue drains | Next prompt auto-sent when ready |
| Cancel requested | SIGINT sent, queue preserved |
| Reset requested | PTY killed, queue cleared |

The UI shows queue status via the `commander.state` message:
```typescript
{
  type: "commander.state",
  state: {
    status: "working",
    queuedPrompts: 2,  // UI shows "Commander is working (2 queued)..."
    ...
  }
}
```

### PTY Errors

PTY sessions can fail with these conditions:

| Condition | Error | Recovery |
|-----------|-------|----------|
| PTY process dies | `PTY exited unexpectedly` | Auto-recreate on next prompt |
| Spawn failure | `Command not found: claude` | Check PATH, claude installation |
| Session file not found | `Failed to capture session ID` | PTY works but no persistence |

When a PTY error occurs, the `commander.state` message will show `status: "idle"` with `ptySessionId: null`. The next `commander.send` will attempt to create a new PTY session.

---

## Related Documentation

- [Gateway Architecture](gateway.md) - WebSocket server details
- [Gateway Protocol](../api/gateway-protocol.md) - Complete message reference
- [Session Lifecycle](session-lifecycle.md) - Session states and compaction
- [Fleet DB Schema](fleet-db.md) - Database details
- [REST API Endpoints](../api/endpoints.md) - HTTP endpoint reference
- [Configuration Reference](configuration-reference.md) - All config options
