# Fleet DB Architecture

Fleet DB is the SQLite persistence layer for Fleet Commander, storing project identity, session briefings, event outbox, and headless job queue.

## Overview

**Database Path:** `~/.claude/commander/fleet.db`

```
┌─────────────────────────────────────────────────────────────────┐
│                        Fleet DB (SQLite)                         │
├─────────────────┬─────────────────┬─────────────────────────────┤
│    projects     │    briefings    │      outbox_events          │
│  (repo identity)│ (session history)│  (push/replay queue)       │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                          jobs                                    │
│              (headless job queue + history)                      │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Database | SQLite (via better-sqlite3) |
| ORM | Drizzle ORM |
| Schema | `packages/daemon/src/fleet-db/schema.ts` |

---

## Schema

### Projects Table

Repository identity with unique project IDs.

```sql
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,      -- Format: {repo_name}__{8-char-hash}
  repo_name TEXT NOT NULL,          -- Human-readable name
  repo_root TEXT NOT NULL,          -- Absolute filesystem path
  git_remote TEXT,                  -- Origin URL
  status TEXT DEFAULT 'active',     -- active|archived
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Project ID Format:** `{repo_name}__{8-char-hash}`

The hash ensures uniqueness for same-named repos (forks, orgs):

```typescript
// Example: mimesis__607a7a7c
const projectId = generateProjectId("mimesis", "git@github.com:user/mimesis.git");
```

### Briefings Table

Durable history of session completions.

```sql
CREATE TABLE briefings (
  briefing_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  session_id TEXT,
  task_id TEXT,
  status TEXT NOT NULL,             -- completed|blocked|failed|waiting_for_input
  started_at TEXT,
  ended_at TEXT,
  impact_level TEXT,                -- trivial|minor|moderate|major
  broadcast_level TEXT,             -- silent|mention|highlight
  doc_drift_risk TEXT,              -- low|medium|high
  base_commit TEXT,
  head_commit TEXT,
  branch TEXT,
  blockers_json TEXT,               -- JSON array of blockers
  next_steps_json TEXT,             -- JSON array of next steps
  docs_touched_json TEXT,           -- JSON array of doc paths
  files_touched_json TEXT,          -- JSON array of file paths
  raw_markdown TEXT NOT NULL,       -- Full briefing content
  created_at TEXT NOT NULL,
  UNIQUE(project_id, session_id, task_id, ended_at)
);
```

**Status Values:**

| Status | Description |
|--------|-------------|
| `completed` | Task finished successfully |
| `blocked` | Waiting on external dependency |
| `failed` | Task failed with error |
| `waiting_for_input` | Needs user input |

**Impact Levels:**

| Level | Description |
|-------|-------------|
| `trivial` | Minor change, no review needed |
| `minor` | Small change, quick review |
| `moderate` | Significant change, full review |
| `major` | Breaking change or large refactor |

### Outbox Events Table

Push and replay queue for fleet events.

```sql
CREATE TABLE outbox_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                 -- ISO timestamp
  type TEXT NOT NULL,               -- See Event Types below
  project_id TEXT,
  briefing_id INTEGER,
  broadcast_level TEXT,             -- silent|mention|highlight (for prelude filtering)
  payload_json TEXT NOT NULL,       -- Event-specific data
  delivered INTEGER DEFAULT 0       -- Boolean: pushed to clients
);
```

**Event Types:**

| Type | Description | Typical broadcast_level |
|------|-------------|------------------------|
| `briefing_added` | New briefing created | mention or highlight |
| `session_started` | Session begins | silent |
| `session_blocked` | Session blocked on dependency | alert (always shown) |
| `doc_drift_warning` | High doc drift risk detected | alert (always shown) |
| `skill_updated` | Skill definition changed | mention |
| `job_completed` | Headless job finished | mention |
| `error` | System error event | alert (always shown) |

**Broadcast Levels:**

| Level | Description |
|-------|-------------|
| `silent` | Not shown in Commander prelude (roster awareness only) |
| `mention` | Included in prelude up to cap (10 max) |
| `highlight` | Priority in prelude (max 1 per project) |

See [Commander Architecture](commander.md#fleet-prelude-compaction) for the compaction algorithm.

### Jobs Table

Headless job queue and execution history.

```sql
CREATE TABLE jobs (
  job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_created TEXT NOT NULL,
  ts_started TEXT,
  ts_finished TEXT,
  type TEXT NOT NULL,               -- worker_task|skill_patch|doc_patch|commander_turn
  project_id TEXT,
  repo_root TEXT,
  model TEXT NOT NULL,              -- opus|sonnet|haiku
  status TEXT NOT NULL,             -- queued|running|completed|failed|canceled
  request_json TEXT NOT NULL,       -- Job input parameters
  stream_chunks_json TEXT,          -- Full stream output for replay
  result_json TEXT,                 -- Job result
  error TEXT
);
```

**Job Status Flow:**

```
queued → running → completed
                 → failed
                 → canceled
```

**Job Types:**

| Type | Description |
|------|-------------|
| `worker_task` | General worker task |
| `skill_patch` | Update skill definition |
| `doc_patch` | Documentation update |
| `commander_turn` | Commander conversation turn |

### Conversations Table

Stateful conversation sessions for Commander and future worker sessions.

```sql
CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,     -- UUID we control
  kind TEXT NOT NULL,                   -- 'commander' | 'worker_session' (future)
  cwd TEXT NOT NULL,                    -- Working directory
  model TEXT NOT NULL,                  -- opus|sonnet|haiku
  claude_session_id TEXT,               -- Session ID from Claude CLI (for --resume)
  last_outbox_event_id_seen INTEGER DEFAULT 0,  -- Fleet prelude cursor
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Fields:**

| Field | Description |
|-------|-------------|
| `conversation_id` | UUID we generate and control (stable across PTY restarts) |
| `kind` | Conversation type: `commander` for Opus meta-agent |
| `claude_session_id` | Claude CLI's session ID, captured from JSONL filename |
| `last_outbox_event_id_seen` | Cursor for fleet prelude delta injection |

---

## Repository APIs

### ProjectRepo

```typescript
import { ProjectRepo, generateProjectId } from "@mimesis/daemon/fleet-db";

const repo = new ProjectRepo();

// Create or find project
const projectId = repo.ensureProject({
  repoName: "mimesis",
  repoRoot: "/Users/kyle/code/mimesis",
  gitRemote: "git@github.com:user/mimesis.git"
});

// Get project
const project = repo.get(projectId);

// List active projects
const active = repo.getActive();

// Find by path
const found = repo.findByRepoRoot("/Users/kyle/code/mimesis");

// Archive project (soft delete)
repo.archive(projectId);
```

### BriefingRepo

```typescript
import { BriefingRepo } from "@mimesis/daemon/fleet-db";

const repo = new BriefingRepo();

// Insert briefing (idempotent)
const briefingId = repo.insert({
  projectId: "mimesis__607a7a7c",
  sessionId: "abc123",
  taskId: "task-001",
  status: "completed",
  impactLevel: "minor",
  broadcastLevel: "mention",
  rawMarkdown: "## Summary\n\nFixed login bug..."
});

// Upsert briefing
const id = repo.upsert({
  projectId: "mimesis__607a7a7c",
  sessionId: "abc123",
  status: "completed",
  rawMarkdown: "..."
});

// Query briefings
const briefings = repo.query({
  projectId: "mimesis__607a7a7c",
  status: "completed",
  impactLevel: "major",
  limit: 10
});

// Get recent across all projects
const recent = repo.getRecent(20);

// Get by project
const projectBriefings = repo.getByProject("mimesis__607a7a7c");

// Get high doc drift risk
const risky = repo.getHighDocDriftRisk(10);

// Update semantic fields
repo.updateSemanticFields(briefingId, {
  impactLevel: "moderate",
  docDriftRisk: "high"
});
```

### OutboxRepo

```typescript
import { OutboxRepo } from "@mimesis/daemon/fleet-db";

const repo = new OutboxRepo();

// Add event
const eventId = repo.add({
  type: "briefing_added",
  projectId: "mimesis__607a7a7c",
  briefingId: 42,
  payloadJson: JSON.stringify({ ... })
});

// Get undelivered events
const pending = repo.getUndelivered();

// Get events after cursor
const events = repo.getAfter(lastEventId);

// Mark as delivered
repo.markDelivered(eventId);
```

### JobRepo

```typescript
import { JobRepo } from "@mimesis/daemon/fleet-db";

const repo = new JobRepo();

// Create job
const jobId = repo.create({
  type: "commander_turn",
  projectId: "mimesis__607a7a7c",
  model: "sonnet",
  status: "queued",
  requestJson: JSON.stringify({
    prompt: "Generate briefing summary",
    systemPrompt: "..."
  })
});

// Start job
repo.updateStatus(jobId, "running");

// Append stream chunk
repo.appendStreamChunk(jobId, chunk);

// Complete job
repo.complete(jobId, resultJson);

// Fail job
repo.fail(jobId, "Error message");

// Get pending jobs
const pending = repo.getPending();

// Get job history
const history = repo.getByProject("mimesis__607a7a7c", 50);
```

---

## Database Management

### Generate Migrations

```bash
pnpm --filter @mimesis/daemon db:generate
```

Creates Drizzle ORM migrations from schema changes.

### Apply Migrations

```bash
pnpm --filter @mimesis/daemon db:migrate
```

Applies pending migrations to the database.

### Database Studio

```bash
pnpm --filter @mimesis/daemon db:studio
```

Opens Drizzle Studio GUI for inspection.

---

## Outbox Pattern

Fleet DB uses the transactional outbox pattern for reliable event delivery:

```
1. Briefing inserted → outbox_event created (same transaction)
2. OutboxTailer polls for undelivered events
3. Gateway broadcasts to WebSocket clients
4. Event marked as delivered
```

This ensures:
- Events are never lost (persisted before delivery)
- Clients can replay from any cursor
- Crash recovery via redelivery

---

## Briefing Ingestion Flow

```
StopHook fires
    │
    ▼
Parse raw markdown
    │
    ▼
Extract semantic fields (Sonnet)
    │
    ▼
briefingRepo.upsert()
    │
    ▼
outboxRepo.add("briefing_added")
    │
    ▼
OutboxTailer broadcasts to Gateway
    │
    ▼
Gateway pushes to subscribed clients
```

---

## Related Documentation

- [Gateway Architecture](gateway.md) - WebSocket server
- [Daemon API](../api/daemon-api.md) - REST endpoints
- [CLI Reference](../cli-reference.md) - Database commands
