# Fleet Commander v5 Implementation Plan

**Version:** 5.1
**Status:** Ready for Implementation
**Created:** 2026-01-11
**Updated:** 2026-01-11

---

## Executive Summary

Transform Mimesis from a terminal-centric session monitor into Fleet Commander v5: a **SQLite briefing ledger** with **headless streaming gateway**. Workers produce structured briefings; Commander (Opus) answers cross-project questions; Sonnet handles maintenance tasks.

**Core Principle:** Bet on model intelligence for meaning, bet on determinism for execution.

### Key Design Decisions (from user interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PTY Server | **Replace entirely** | Gateway subsumes PTY functionality |
| TerminalDock | **Remove entirely** | Chat UI replaces xterm.js |
| Database Location | `~/.claude/commander/fleet.db` | Shared across projects |
| Sonnet Invocation | Headless `claude -p` | No daemon process |
| Commander Model | **Opus** | For cross-project intelligence |
| UI Mode | **Focus mode only** | No ops mode fallback |
| Implementation | **Phase 1 & 2 in parallel** | Independent work streams |
| Migration | **None** | v5 starts fresh |
| Terminal fallback | **None (structured only)** | Remove xterm.js entirely |
| Hook IPC | **Unix socket** | `~/.claude/commander/gateway.sock` |
| Session spawn | **Roster '+' button** | Gateway-native via WS |
| Commander UI | **Separate tab** | Distinct from session streams |
| Project switch | **Full context switch** | TacticalIntel + Timeline update together |
| Ring buffer | **20MB per session** | Generous for long sessions |
| Virtualization | **Always (@tanstack/react-virtual)** | TanStack ecosystem match |
| Sonnet finalize | **Block stop hook** | Guarantees complete briefing |
| Collapse default | **Thinking collapsed, output expanded** | Clean but informative |
| Crash recovery | **Sessions survive (orphaned)** | PID file for reattachment |
| Commander history | **Persist in SQLite** | Reload on refresh |
| Status inference | **Gateway events** | Gateway pushes status changes |
| Commander storage | **Full stream** | Store all chunks for replay |
| Durable Streams | **Remove immediately** | Gateway replaces, clean break |

---

## Phase 1: SQLite Briefing Ledger

### 1.1 Create Fleet Database Module

**Location:** `packages/daemon/src/fleet-db/`

| File | Purpose |
|------|---------|
| `index.ts` | Connection singleton for `~/.claude/commander/fleet.db` |
| `schema.ts` | Drizzle schema (projects, briefings, outbox_events, jobs) |
| `project-repo.ts` | Projects table repository |
| `briefing-repo.ts` | Briefings table repository |
| `outbox-repo.ts` | Outbox events repository |
| `job-repo.ts` | Jobs table repository (stub for Phase 3) |
| `status-v5-parser.ts` | Parser for status.v5 YAML frontmatter |
| `briefing-ingestor.ts` | Transactional ingestion service |

### 1.2 Database Schema

```sql
-- projects: repo identity
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,  -- format: {repo_name}__{8-char-hash}
  repo_name TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  git_remote TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- briefings: durable history
CREATE TABLE briefings (
  briefing_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  session_id TEXT,
  task_id TEXT,
  status TEXT NOT NULL,  -- completed|blocked|failed|waiting_for_input
  started_at TEXT,
  ended_at TEXT,
  impact_level TEXT,     -- trivial|minor|moderate|major
  broadcast_level TEXT,  -- silent|mention|highlight
  doc_drift_risk TEXT,   -- low|medium|high
  base_commit TEXT,
  head_commit TEXT,
  branch TEXT,
  blockers_json TEXT,
  next_steps_json TEXT,
  docs_touched_json TEXT,
  files_touched_json TEXT,
  raw_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, session_id, task_id, ended_at)
);

-- outbox_events: push + replay queue
CREATE TABLE outbox_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,  -- briefing_added|skill_updated|job_completed|error
  project_id TEXT,
  briefing_id INTEGER,
  payload_json TEXT NOT NULL,
  delivered INTEGER DEFAULT 0
);

-- jobs: headless job queue + Commander history
CREATE TABLE jobs (
  job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_created TEXT NOT NULL,
  ts_started TEXT,
  ts_finished TEXT,
  type TEXT NOT NULL,  -- worker_task|skill_patch|doc_patch|commander_turn
  project_id TEXT,
  repo_root TEXT,
  model TEXT NOT NULL,  -- opus|sonnet|haiku
  status TEXT NOT NULL,  -- queued|running|completed|failed|canceled
  request_json TEXT NOT NULL,
  stream_chunks_json TEXT,  -- Full stream output for replay (Commander history)
  result_json TEXT,
  error TEXT
);
```

### 1.3 Implementation Tasks

- [ ] Create `packages/daemon/src/fleet-db/` directory structure
- [ ] Implement connection singleton with WAL mode
- [ ] Implement Drizzle schema definitions
- [ ] Implement ProjectRepo with `generateProjectId()` (hash of git_remote + repo_name)
- [ ] Implement BriefingRepo with idempotent insert
- [ ] Implement OutboxRepo with cursor-based delivery
- [ ] Implement status-v5-parser with YAML list support
- [ ] Implement BriefingIngestor with transactional project+briefing+outbox insert
- [ ] Add `/api/v1/fleet/ingest` endpoint for hook-based ingestion
- [ ] Add `packages/daemon/src/config/fleet.ts` for constants

---

## Phase 2: Status.v5 Hooks and Ingestion

### 2.1 Status.v5 Schema

```yaml
---
schema: status.v5

# identity
project_id: my-app__a1b2c3d4
repo_name: my-app
repo_root: /path/to/repo
git_remote: git@github.com:org/repo.git
branch: feature/auth

# session + task
session_id: UUID
task_id: 2026-01-11T0900Z__auth__01
status: completed
started_at: ISO
ended_at: ISO

# semantic fields (Sonnet-authored)
impact_level: moderate
broadcast_level: highlight
doc_drift_risk: high

# traceability
base_commit: 1a2b3c4
head_commit: 5d6e7f8

# structured lists
blockers: []
next_steps: []
docs_touched: []
files_touched: []
---
# Briefing

## Summary
(Sonnet) One paragraph summary

## Technical Notes
(Sonnet) Key decisions and gotchas
```

### 2.2 Hook Scripts

| Hook | Trigger | Purpose |
|------|---------|---------|
| `init-status-v5.py` | SessionStart (startup) | Pre-populate status skeleton with project_id, task_id |
| `finalize-status-v5.py` | Stop (phase 2) | Call Sonnet to fill semantic fields |
| `ingest-status-v5.py` | After finalize | Insert into SQLite + outbox event |

### 2.3 Sonnet Invocation Pattern

```bash
claude -p \
  --model sonnet \
  --output-format json \
  --json-schema @~/.claude/commander/schemas/finalize_status.json \
  --max-turns 1 \
  --disallowedTools "Bash,Edit,Write,TodoWrite" \
  "Analyze git diff and fill semantic fields..."
```

### 2.4 Implementation Tasks

- [ ] Create `~/.claude/hooks/init-status-v5.py`
  - Compute project_id from git remote hash
  - Generate task_id from timestamp
  - Write status.v5 skeleton on SessionStart
- [ ] Create `~/.claude/hooks/finalize-status-v5.py`
  - Collect git diff context
  - Invoke headless Sonnet with JSON schema
  - Update status file with semantic fields
- [ ] Create `~/.claude/hooks/ingest-status-v5.py`
  - Parse status.v5 YAML
  - Insert into fleet.db
  - Write outbox event
- [ ] Create `~/.claude/commander/schemas/finalize_status.json`
- [ ] Update `stop-validator.py` to call finalize after status check
- [ ] Update `~/.claude/settings.json` with SessionStart hook
- [ ] Update `packages/daemon/src/status-parser.ts` for v5 schema
- [ ] Maintain backward compatibility with v1 status files

---

## Phase 3: Fleet Gateway (Two-Way I/O Bridge)

### 3.1 Bridging Architecture

**Key insight:** PTY remains as transport, but UI renders structured events (not xterm.js).

The gateway provides **dual-channel observability**:
1. **Raw I/O stream** (from PTY) - realtime output, progress, debugging
2. **Structured hook events** - deterministic tool/phase rendering

**Gateway replaces PTY server on port 4452** (consolidates into single WebSocket)

```
packages/daemon/src/gateway/
  gateway-server.ts     # WebSocket connection manager (replaces pty/ws-server.ts)
  pty-bridge.ts         # PTY spawn + read/write + resize + signals
  event-merger.ts       # Merge PTY stdout + hook events into ordered stream
  ring-buffer.ts        # In-memory event buffer for replay
  outbox-tailer.ts      # Poll outbox, push fleet events to clients
  job-runner.ts         # Spawn claude -p, stream output
  job-manager.ts        # Queue, concurrency, lifecycle
  protocol.ts           # Event type definitions (stdout, tool, status, job)
  stream-parser.ts      # Parse stream-json output
```

### 3.2 Session Lifecycle

**Start (Interactive PTY Session)**
1. Gateway allocates `session_id` (e.g., `s_<ulid>`)
2. Gateway spawns PTY with `claude` in repo root
3. Environment: `FLEET_SESSION_ID=<session_id>`, `TERM=xterm-256color`

**Attach**
- UI calls `session.attach(session_id, from_seq)`
- Gateway replays events from ring buffer, then streams live

**Stop**
- UI requests stop or user exits
- Gateway terminates process group (SIGINT → SIGTERM → SIGKILL)
- Worker stop hook writes status.v5, ingestion populates SQLite

### 3.3 WebSocket Protocol

**Client → Gateway:**
```typescript
// Fleet events (briefings, skills)
{ type: 'fleet.subscribe', from_event_id: 0 }

// Session lifecycle (gateway-native spawn)
{ type: 'session.create', project_id: 'my-app__a1b2c3d4', repo_root: '/path/to/repo' }
{ type: 'session.attach', session_id: 's_123', from_seq: 0 }
{ type: 'session.detach', session_id: 's_123' }

// Session I/O
{ type: 'session.stdin', session_id: 's_123', data: 'run tests\n' }
{ type: 'session.signal', session_id: 's_123', signal: 'SIGINT' }
{ type: 'session.resize', session_id: 's_123', cols: 120, rows: 40 }

// Headless jobs (Sonnet maintenance, Commander)
{ type: 'job.create', job: { type, model, request: { prompt } } }
{ type: 'job.cancel', job_id: 123 }
```

**Gateway → Client:**
```typescript
// Fleet events
{ type: 'fleet.event', event_id, ts, event: { type: 'briefing_added', ... } }

// Session lifecycle
{ type: 'session.created', session_id: 's_123', project_id: '...', pid: 12345 }
{ type: 'session.status', session_id: 's_123', status: 'working' | 'waiting' | 'idle' }
{ type: 'session.ended', session_id: 's_123', exit_code: 0 }

// Session events (merged PTY + hooks)
{ type: 'event', session_id: 's_123', seq: 1001, event: { type: 'stdout', data: '...' } }
{ type: 'event', session_id: 's_123', seq: 1042, event: {
  type: 'tool', phase: 'post', tool_name: 'Bash', tool_input: { command: 'git status' }, ok: true
} }

// Job events
{ type: 'job.started', job_id: 'j_456', project_id: '...' }
{ type: 'job.stream', job_id: 'j_456', chunk: { /* stream-json object */ } }
{ type: 'job.completed', job_id: 'j_456', ok: true }
```

### 3.4 Hook Event Forwarding (Unix Socket IPC)

**Socket path:** `~/.claude/commander/gateway.sock`

**PostToolUse hook calls:** `python3 ~/.claude/hooks/fleet-forward-hook-event.py`

The forwarder:
1. Reads hook JSON from stdin
2. Adds `session_id` from `FLEET_SESSION_ID` env
3. Connects to Unix socket, sends JSON line, closes

**Gateway listens on socket (in daemon process):**
- Single listener thread in gateway server
- Merges hook events into session event stream
- Gateway stamps monotonic `seq` on arrival
- UI groups output around tool events (best effort)

**Fallback:** If socket unavailable, hook silently no-ops (non-blocking)

### 3.5 Backpressure & Buffering

- In-memory ring buffer: **20MB per session**
- Max WS send queue size (drop/coalesce if UI slow)
- Optional disk log (JSONL) for replay/debug
- **Rule:** Never block PTY read loop on WS send

### 3.6 Crash Recovery (Sessions Survive)

Sessions are **orphaned** on gateway crash, not killed:
- Gateway writes PID file per session: `~/.claude/commander/sessions/<session_id>.pid`
- On startup, gateway scans for orphaned PIDs
- For each live PID: recreate session entry, attempt PTY reattach
- For each dead PID: clean up, mark session ended

**Reattach flow:**
1. Gateway finds orphan PID file
2. Checks if process still running (`kill -0 pid`)
3. If alive: creates new PTY master (loses history but regains control)
4. If dead: removes PID file, emits `session.ended`

### 3.7 Concurrency Control (Jobs)

- `maxConcurrentJobs: 3` (global)
- `maxPerProject: 1` (prevent hammering)
- `jobTimeoutMs: 300000` (5 minutes)
- Crash recovery: mark stale `running` jobs as `failed` on startup

### 3.8 Implementation Tasks

- [ ] Create `packages/daemon/src/gateway/` module structure
- [ ] Implement `PtyBridge` (spawn, read/write, resize, signals)
- [ ] Implement `EventMerger` (merge PTY stdout + hook events)
- [ ] Implement `RingBuffer` (20MB per session) for event replay
- [ ] Implement `GatewayServer` with session create/attach/detach
- [ ] Implement Unix socket listener for hook IPC (`gateway.sock`)
- [ ] Implement `OutboxTailer` with cursor-based polling
- [ ] Implement `JobRunner` for headless Claude invocations
- [ ] Implement `stream-parser.ts` for stream-json parsing
- [ ] Implement signal escalation (SIGINT → SIGTERM → SIGKILL)
- [ ] Implement crash recovery (PID file scan, orphan reattach)
- [ ] Implement status inference from PTY activity + hooks
- [ ] Add gateway startup to `serve.ts` on port 4452
- [ ] Remove old `pty/ws-server.ts` (replaced by gateway)
- [ ] Create `~/.claude/hooks/fleet-forward-hook-event.py`
- [ ] Update settings.json with PostToolUse hook

---

## Phase 4: UI Timeline View (Melty-Style Layout)

### 4.1 Layout Architecture

**3-Column Layout (like Melty reference)**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MIMESIS                                               AGENTS: 2/10 Active   │
├──────────────┬──────────────────────────────────────┬───────────────────────┤
│              │                                      │                       │
│   ROSTER     │          TIMELINE                    │   TACTICAL INTEL      │
│  (Sessions)  │      (Chat-style events)             │   (File changes)      │
│              │                                      │                       │
│ ▼ PROJECT-A  │  ┌────────────────────────────────┐  │  STATUS: Working      │
│   ○ main     │  │ Bash(git status)               │  │                       │
│   ● main     │  │ ┌──────────────────────────┐   │  │  NOW: Implementing    │
│              │  │ │ On branch main            │   │  │  auth flow           │
│ ▼ PROJECT-B  │  │ │ Changes staged: 2 files   │   │  │                       │
│   ○ main     │  │ └──────────────────────────┘   │  │  CWD: /project        │
│              │  │ ✓ completed                    │  │                       │
│              │  └────────────────────────────────┘  │  LAST ACTIVITY: 2m    │
│              │                                      │                       │
│              │  ┌────────────────────────────────┐  │  RECENT OUTPUT:       │
│              │  │ Read(src/auth.ts)              │  │  • Writing auth.ts    │
│              │  │ ┌──────────────────────────┐   │  │  • Running tests      │
│              │  │ │ import { signIn } from   │   │  │                       │
│              │  │ │ ...                       │   │  │                       │
│              │  │ └──────────────────────────┘   │  │                       │
│              │  └────────────────────────────────┘  │                       │
│              │                                      │                       │
│              │  ┌────────────────────────────────┐  │                       │
│              │  │ 💬 Input                        │  │                       │
│              │  │ ┌──────────────────────────┐   │  │                       │
│              │  │ │ Type your message...     │   │  │                       │
│              │  │ └──────────────────────────┘   │  │                       │
│              │  └────────────────────────────────┘  │                       │
└──────────────┴──────────────────────────────────┴───────────────────────────┘
```

**Key changes from current UI:**
- Center column: Replace xterm.js terminal with structured Timeline
- Tool events rendered as expandable cards (not raw ANSI)
- PTY output shown as collapsible logs within tool cards
- Input composer at bottom for stdin to active session

### 4.2 New Components

```
packages/ui/src/components/
  timeline/
    Timeline.tsx           # Main event stream (@tanstack/react-virtual virtualized)
    TimelineEvent.tsx      # Single event dispatcher by type
    TimelineToolStep.tsx   # Tool use/result card with expandable output
    TimelineText.tsx       # Streaming text block (markdown)
    TimelineThinking.tsx   # Collapsible thinking (collapsed by default)
    TimelineStdout.tsx     # PTY output block (expanded by default)
    TimelineProgress.tsx   # Progress indicators (spinner, percentage)
  session-input/
    SessionInput.tsx       # Input composer at bottom
    InputHistory.tsx       # Up/down arrow history recall
  commander/
    CommanderTab.tsx       # Separate Commander conversation tab
    CommanderHistory.tsx   # Persisted conversation from SQLite
    CommanderInput.tsx     # Opus prompt input
  roster/
    RosterSessionSpawn.tsx # '+' button for new session spawn
```

### 4.3 Hooks

```typescript
// hooks/useGateway.ts
interface UseGatewayResult {
  status: 'connecting' | 'connected' | 'disconnected';
  fleetEvents: FleetEvent[];
  lastEventId: number;
  // Sessions
  sessions: Map<string, SessionState>;
  attachSession: (sessionId: string) => void;
  detachSession: (sessionId: string) => void;
  sendStdin: (sessionId: string, data: string) => void;
  sendSignal: (sessionId: string, signal: string) => void;
  // Jobs
  activeJob: { jobId, events, isComplete, result? } | null;
  createJob: (request) => void;
  cancelJob: () => void;
}

// hooks/useSessionEvents.ts
interface UseSessionEventsResult {
  events: SessionEvent[];        // Merged PTY + hook events
  isAttached: boolean;
  attachedSession: string | null;
}
```

### 4.4 Event Rendering Strategy

**Timeline renders events by type:**

| Event Type | Renderer | Default State | Behavior |
|------------|----------|---------------|----------|
| `tool` (phase=pre) | `TimelineToolStep` | Expanded | Show tool name + input, spinner |
| `tool` (phase=post) | `TimelineToolStep` | Expanded | Update with result, ✓ or ✗ |
| `stdout` | `TimelineStdout` | **Expanded** | Append to current tool's output |
| `text` | `TimelineText` | Expanded | Render as markdown |
| `thinking` | `TimelineThinking` | **Collapsed** | Dimmed, click to expand |
| `progress` | `TimelineProgress` | N/A | Replace-line semantics |

**Grouping heuristic:**
- stdout events between `tool.pre` and `tool.post` group under that tool
- standalone stdout (no active tool) renders as separate block

**Virtualization (@tanstack/react-virtual):**
- Essential for sessions with 1000+ events
- Dynamic row height via `useVirtualizer` with `estimateSize`
- Scroll-to-bottom on new events (unless user scrolled up)

### 4.5 FleetCommand Layout Changes

- **Remove:** `Viewport.tsx` (xterm.js wrapper), `TerminalDock.tsx`
- **Replace:** Center panel with `<Timeline>` + `<SessionInput>`
- **Keep:** `Roster.tsx` (left), `TacticalIntel.tsx` (right)

### 4.6 Implementation Tasks

**Hooks:**
- [ ] Create `packages/ui/src/hooks/useGateway.ts` with session + job support
- [ ] Create `packages/ui/src/hooks/useSessionEvents.ts` for event stream
- [ ] Create `packages/ui/src/hooks/useCommanderHistory.ts` for SQLite history

**Timeline components:**
- [ ] Create `Timeline.tsx` with @tanstack/react-virtual useVirtualizer
- [ ] Create `TimelineToolStep.tsx` with expandable output
- [ ] Create `TimelineText.tsx` for streaming markdown
- [ ] Create `TimelineThinking.tsx` (collapsed by default)
- [ ] Create `TimelineStdout.tsx` (expanded by default)
- [ ] Create `TimelineProgress.tsx` for progress indicators

**Session input:**
- [ ] Create `SessionInput.tsx` with history recall
- [ ] Create `InputHistory.tsx` for up/down arrow navigation

**Commander tab:**
- [ ] Create `CommanderTab.tsx` as separate conversation view
- [ ] Create `CommanderHistory.tsx` to load from SQLite jobs table
- [ ] Create `CommanderInput.tsx` for Opus prompts

**Roster:**
- [ ] Create `RosterSessionSpawn.tsx` ('+' button per project)
- [ ] Wire spawn button to `session.create` gateway message

**Layout integration:**
- [ ] Modify `FleetCommand.tsx` to use new 3-column layout
- [ ] Add Commander tab to navigation
- [ ] Remove `Viewport.tsx`, `TerminalDock.tsx`, xterm.js deps
- [ ] Update `TacticalIntel.tsx` to show fleet events
- [ ] Wire session selection from Roster to Timeline attachment
- [ ] Implement full context switch on project change

---

## Port Allocation Summary

| Port | Service | Status |
|------|---------|--------|
| 4450 | ~~Durable Streams (SSE)~~ | **Removed** |
| 4451 | Hono REST API | Unchanged |
| 4452 | **Fleet Gateway WebSocket** | **New** |

**Note:**
- Port 4452 hosts unified Fleet Gateway (PTY sessions + jobs + fleet events)
- Durable Streams removed entirely; gateway provides all realtime data
- Old `pty/ws-server.ts` removed; gateway subsumes all functionality

---

## Critical Files

### Daemon (packages/daemon/src/)

**New modules:**
- `fleet-db/` - SQLite briefing ledger (all files)
- `gateway/` - Two-way I/O bridge (all files)
- `config/fleet.ts` - Constants and config
- `api/routes/fleet.ts` - Ingestion endpoint

**Modified:**
- `serve.ts` - Remove Durable Streams + PTY, add gateway startup
- `status-parser.ts` - Add v5 schema support

**Removed:**
- `pty/ws-server.ts` - Replaced by gateway
- `pty/terminal-manager.ts` - Functionality moved to gateway
- `server.ts` (Durable Streams) - Replaced by gateway
- `watcher.ts` - No longer needed (gateway manages sessions)
- `status-machine.ts` - Status now inferred by gateway

### UI (packages/ui/src/)

**New modules:**
- `hooks/useGateway.ts` - Gateway connection + session management
- `hooks/useSessionEvents.ts` - Event stream hook
- `hooks/useCommanderHistory.ts` - Commander SQLite history
- `components/timeline/` - All timeline components
- `components/session-input/` - Input composer
- `components/commander/` - Commander tab components
- `components/roster/RosterSessionSpawn.tsx` - '+' button

**Modified:**
- `components/fleet-command/FleetCommand.tsx` - New 3-column layout + Commander tab
- `components/fleet-command/TacticalIntel.tsx` - Fleet event display
- `components/fleet-command/Roster.tsx` - Session selection → attachment + spawn

**Removed:**
- `components/fleet-command/Viewport.tsx` - Replaced by Timeline
- `components/fleet-command/TerminalDock.tsx` - No longer needed
- `data/sessionsDb.ts` - Durable Streams client removed
- `hooks/useSessions.ts` - Replaced by useGateway
- xterm.js dependencies
- @durable-streams/* dependencies

### Hooks (~/.claude/hooks/)

**New:**
- `init-status-v5.py` - SessionStart skeleton
- `finalize-status-v5.py` - Stop phase Sonnet invocation
- `ingest-status-v5.py` - SQLite ingestion
- `fleet-forward-hook-event.py` - PostToolUse → gateway IPC

**Modified:**
- `stop-validator.py` - Call finalize after status check
- `settings.json` - Add SessionStart, PostToolUse hooks

### Config (~/.claude/)
- `commander/fleet.db` - New database
- `commander/schemas/finalize_status.json` - Sonnet output schema

---

## Verification Plan

### Phase 1 Verification
1. Run daemon, verify `~/.claude/commander/fleet.db` created
2. Query tables: `sqlite3 ~/.claude/commander/fleet.db ".tables"`
3. Manually insert test briefing, verify outbox event created

### Phase 2 Verification
1. Start new Claude session, verify `status.v5` skeleton created
2. Complete task, verify Sonnet called and semantic fields filled
3. Check `fleet.db` for ingested briefing
4. Query: `SELECT * FROM briefings ORDER BY created_at DESC LIMIT 1`

### Phase 3 Verification
1. Connect to gateway: `websocat ws://localhost:4452`
2. Send: `{"type":"fleet.subscribe","from_event_id":0}`
3. Verify outbox events replayed
4. Create job: `{"type":"job.create","job":{...}}`
5. Verify stream events received

### Phase 4 Verification
1. Open Mimesis UI
2. Click session in Roster, verify Timeline attaches
3. Watch tool events render as cards with output
4. Type in SessionInput, verify stdin sent
5. Click cancel button, verify SIGINT sent
6. Test Commander job creation and streaming

---

## Deterministic Guarantees & Safety Rules

1. **PTY stream is not the source of truth.**
   Source of truth for completed work is `.claude/status.v5` → SQLite ingestion.

2. **Hooks are best-effort realtime enrichment.**
   If they fail, nothing about ingestion/ledger correctness changes.

3. **Structured outputs remain schema validated.**
   Maintenance jobs must produce schema-validated JSON before patches apply.

4. **No blocking hooks.**
   Hook forwarding must be non-blocking and must not slow worker UX.

5. **FLEET_SESSION_ID correlation.**
   All sessions share `session_id` across: PTY events ↔ hook events ↔ status.v5 ↔ SQLite.

---

## Implementation Order

**Phase 1 & 2 run in parallel** (independent work streams)

```
┌─────────────────────────────────────────┬───────────────────────────────────────┐
│ STREAM A: Database & Daemon             │ STREAM B: Hooks & Settings            │
├─────────────────────────────────────────┼───────────────────────────────────────┤
│ 1A: Fleet DB schema + repositories      │ 2A: Hook scripts (init, finalize,     │
│ 1B: Status v5 parser + ingestor         │     ingest, forward)                  │
│ 1C: /api/v1/fleet/ingest endpoint       │ 2B: Stop-validator integration        │
│                                         │ 2C: settings.json updates             │
└─────────────────────────────────────────┴───────────────────────────────────────┘
                              ↓ Both complete
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Fleet Gateway (Two-Way I/O Bridge)                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 3A: Gateway server + PtyBridge + EventMerger                                    │
│ 3B: Outbox tailer + fleet event push                                            │
│ 3C: Job runner + stream parser                                                  │
│ 3D: Remove old pty/ws-server.ts                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Phase 4: UI Timeline View                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 4A: useGateway + useSessionEvents hooks                                         │
│ 4B: Timeline components (tool step, stdout, text, thinking)                     │
│ 4C: SessionInput with history                                                   │
│ 4D: FleetCommand layout integration                                             │
│ 4E: Remove Viewport.tsx, TerminalDock.tsx, xterm.js                             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## References

- **Spec:** `FLEET_CMD_SPEC_V5.md` - Authoritative design document
- **Two-Way I/O:** Section in this plan - Claude Code bridging methodology
- **Existing patterns:** `db/terminal-link-repo.ts` (SQLite), `pty/ws-server.ts` (to be replaced)
- **Claude Code CLI:** `claude -p --output-format stream-json --json-schema`
- **Environment contract:** `FLEET_SESSION_ID` passed to spawned Claude processes
