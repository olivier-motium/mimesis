# Fleet Commander Architecture

Fleet Commander is a meta-agent system for cross-project monitoring. It orchestrates Claude Code sessions through hook-based automation, persists briefings to SQLite, and provides fleet-wide intelligence via an Opus-powered Commander.

**Design Philosophy**: Model intelligence for meaning, determinism for execution. AI models (Opus, Sonnet) handle semantic understanding; hooks, SQLite, and WebSocket handle reliable delivery.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Claude Code Sessions                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Session A  │  │  Session B  │  │  Session C  │  │  Commander  │     │
│  │  (mimesis)  │  │  (api-svc)  │  │  (frontend) │  │   (Opus)    │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
└─────────┼────────────────┼────────────────┼────────────────┼────────────┘
          │                │                │                │
          └────────────────┴────────────────┴────────────────┘
                                    │
                           Python Hooks (~/.claude/hooks/)
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│  Status Files    │    │  Unix Socket     │    │  HTTP POST           │
│  .claude/        │    │  gateway.sock    │    │  /api/v1/fleet/ingest│
│  status.v5.*.md  │    │  (PostToolUse)   │    │  (Stop hook)         │
└────────┬─────────┘    └────────┬─────────┘    └──────────┬───────────┘
         │                       │                         │
         └───────────────────────┴─────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Fleet Gateway (port 4452)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  StatusWatcher  │  │  SessionStore   │  │  CommanderSessionMgr    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │               │
│           └────────────────────┴────────────────────────┘               │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      Fleet DB (~/.claude/commander/fleet.db)              │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ projects  │  │ briefings │  │ outbox_events│  │ conversations   │    │
│  └───────────┘  └───────────┘  └──────────────┘  └─────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Mimesis UI (port 5173)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐   │
│  │   Roster     │  │   Timeline   │  │   Commander Tab (Opus chat)  │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Hook Lifecycle

Hooks automate session tracking and briefing creation. Configured in `~/.claude/settings.json`.

### SessionStart

Creates the status.v5 skeleton with project identity.

| Hook | Purpose |
|------|---------|
| `init-status-v5.py` | Creates `.claude/status.v5.<session_id>.md` with project_id, task_id, git context |

**Output**: Status file skeleton with YAML frontmatter. Prints `<system-reminder>` with project identity.

### UserPromptSubmit

Triggered on every prompt submission.

| Hook | Purpose |
|------|---------|
| `status-working.py` | Injects reminder for Claude to update status file |
| `read-docs-trigger.py` | Reminds Claude to read `docs/index.md`, `CLAUDE.md`, `.claude/MEMORIES.md` |
| `skill-reminder.py` | Suggests relevant skills based on prompt content |

### PostToolUse

Forwards tool events for real-time UI updates.

| Hook | Purpose |
|------|---------|
| `fleet-forward-hook-event.py` | Sends event to `~/.claude/commander/gateway.sock` for Timeline streaming |

### Stop (Critical Chain)

The stop flow uses a **two-phase blocking pattern** to ensure quality:

```
/stop (first)                              /stop (second)
     │                                          │
     ▼                                          ▼
status-stop.py                             status-stop.py
     │                                          │
     ▼                                          ▼
stop-validator.py                          stop-validator.py
(stop_hook_active=false)                   (stop_hook_active=true)
     │                                          │
     ▼                                          ├── Check status freshness
EXIT 2 BLOCK                                    │   └── Stale? BLOCK again
     │                                          │
     ▼                                          ▼
Claude sees checklist:                     finalize-status-v5.py
  - CLAUDE.md compliance                        │
  - Documentation updates                       ├── Get git diff
  - Update MEMORIES.md                          ├── Invoke Sonnet (headless)
  - Tests if needed                             └── Fill semantic fields
  - Commit and push                             │
                                                ▼
                                           ingest-status-v5.py
                                                │
                                                ├── POST to daemon
                                                └── Insert briefing + outbox event
                                                │
                                                ▼
                                           EXIT 0 ALLOW
```

#### Stop Hook Details

| Hook | Trigger | Exit Codes | Action |
|------|---------|------------|--------|
| `status-stop.py` | Always | 0 | Reminds Claude to finalize status |
| `stop-validator.py` | Always | 0=allow, 2=block | Phase 1: Show compliance checklist. Phase 2: Check freshness |
| `finalize-status-v5.py` | `stop_hook_active=true` | 0 | Invokes Sonnet for semantic analysis |
| `ingest-status-v5.py` | `stop_hook_active=true` | 0 | POSTs to `http://127.0.0.1:4451/api/v1/fleet/ingest` |

**Sonnet Analysis**: The finalize hook invokes headless Sonnet with the git diff to determine:
- `impact_level`: trivial | minor | moderate | major
- `broadcast_level`: silent | mention | highlight
- `doc_drift_risk`: low | medium | high
- Summary and technical notes

---

## Status.v5 File Format

Location: `.claude/status.v5.<session_id>.md`

```yaml
---
schema: status.v5

# Identity (hook-authored at SessionStart)
project_id: mimesis__607a7a7c     # {repo_name}__{8-char-hash}
repo_name: mimesis
repo_root: /path/to/repo
git_remote: git@github.com:user/repo.git
branch: main

# Session (hook-authored)
session_id: abc123-def456
task_id: 2026-01-12T0717Z         # YYYY-MM-DDTHHMM format
status: working                    # working | completed | blocked | failed
started_at: 2026-01-12T07:17:00Z
ended_at:                          # Set by finalize hook

# Semantic (Sonnet-authored on finalize)
impact_level:                      # trivial | minor | moderate | major
broadcast_level:                   # silent | mention | highlight
doc_drift_risk:                    # low | medium | high

# Traceability
base_commit: abc1234               # HEAD at session start
head_commit:                       # HEAD at session end

# Structured lists (Sonnet-authored)
blockers: []
next_steps: []
docs_touched: []
files_touched: []
---

# Briefing

## Summary
Session in progress...

## Technical Notes
(To be filled by Sonnet on finalize)
```

---

## Commander Session

Commander is an Opus-powered meta-agent with fleet-wide awareness. It uses a **persistent PTY session** for stateful conversation.

### How It Works

```
User prompt in UI
       │
       ▼
CommanderSessionManager.sendPrompt()
       │
       ├── If working → Queue prompt, return queued position
       │
       ▼
Ensure PTY exists (spawn if needed)
       │
       ▼
Build fleet prelude (delta events since last cursor)
       │
       ▼
Inject prelude + prompt into PTY stdin
       │
       ▼
Claude processes, hooks fire naturally
       │
       ▼
StatusWatcher detects completion (status file change)
       │
       ▼
Drain queue if pending prompts
```

**Key Characteristics**:
- **Interactive PTY**: Persistent `claude` session (not headless `claude -p`)
- **Native hooks**: All hooks fire naturally (PostToolUse, Stop, etc.)
- **Fleet prelude**: Injects recent outbox events as `<system-reminder>` blocks in prompt
- **Delta-only context**: Uses cursor (`last_outbox_event_id_seen`) to avoid re-injecting stale events
- **Prompt queue**: Queues prompts when busy, drains automatically when status changes to "waiting_for_input"
- **Session persistence**: Conversation context maintained via PTY session state (no `--resume` needed)

### Fleet Prelude Injection

Before each Commander turn, `FleetPreludeBuilder` constructs context:

```
<system-reminder>
## Recent Fleet Activity
- 2026-01-12 07:30: Project **mimesis** session completed [moderate]
- 2026-01-12 07:25: Project **api-svc** session blocked ⚠️

## Documentation Drift Warnings
- Project **frontend**: High doc drift risk: docs/api.md
</system-reminder>

<user prompt here>
```

**Cursor flow**: Commander stores `last_outbox_event_id_seen` in SQLite. Each prompt queries only `event_id > cursor`. After completion, cursor advances.

### Fleet Prelude Compaction

With many concurrent agents, the prelude could overflow Commander's context. The `FleetPreludeBuilder.compactEvents()` method filters events by `broadcast_level`:

| Priority | Level | Behavior |
|----------|-------|----------|
| 1 | **Alerts** | Always included (blocked, failed, errors, doc_drift_warning) |
| 2 | **Highlight** | Max 1 per project (newest wins) |
| 3 | **Mention** | Capped at 10 total (newest first) |
| 4 | **Silent** | Skipped entirely |

**Constants:**
- `MAX_MENTIONS_PER_PRELUDE = 10`

**Alert detection** (always shown regardless of caps):
- Event type is `error`, `session_blocked`, or `doc_drift_warning`
- Payload status is `blocked` or `failed`
- Job status is `failed`

This ensures Commander sees critical issues while preventing context overflow from routine activity.

### Commander State

```typescript
interface CommanderState {
  status: "idle" | "working" | "waiting_for_input";
  ptySessionId: string | null;      // Current PTY (null when idle)
  claudeSessionId: string | null;   // Claude's session ID (for --resume)
  queuedPrompts: number;            // Pending prompts
  isFirstTurn: boolean;             // System prompt injection flag
}
```

---

## Data Flows

### Session Start → Status Creation

```
SessionStart event
       │
       ▼
init-status-v5.py
       │
       ├── Extract repo name, git remote, branch
       ├── Generate project_id: {repo_name}__{8-char-hash}
       ├── Generate task_id: YYYY-MM-DDTHHMM
       └── Write .claude/status.v5.<session_id>.md
```

### Session End → Briefing Ingestion

```
/stop (second time, stop_hook_active=true)
       │
       ▼
finalize-status-v5.py
       │
       ├── git diff --cached --stat
       ├── claude -p --model sonnet --output-format json
       └── Update status.v5 with semantic fields
       │
       ▼
ingest-status-v5.py
       │
       ├── POST { content, repoName, repoRoot }
       └── → /api/v1/fleet/ingest
       │
       ▼
Daemon
       │
       ├── Parse YAML frontmatter
       ├── Insert into `briefings` table
       └── Create `outbox_events` entry (type: briefing_added)
```

### Tool Event → Timeline Update

```
PostToolUse event
       │
       ▼
fleet-forward-hook-event.py
       │
       ├── Read FLEET_SESSION_ID from env
       └── Send JSON to gateway.sock
       │
       ▼
Gateway Unix socket listener
       │
       ▼
Merge into session event stream
       │
       ▼
WebSocket → UI Timeline
```

---

## Quick Reference

### File Locations

| Path | Purpose |
|------|---------|
| `~/.claude/hooks/` | Python hook scripts |
| `~/.claude/settings.json` | Hook configuration |
| `~/.claude/commander/fleet.db` | SQLite database |
| `~/.claude/commander/gateway.sock` | Unix socket for PostToolUse IPC |
| `~/.claude/commander/schemas/` | JSON schemas for Sonnet output |
| `.claude/status.v5.<session_id>.md` | Session status file (per-project) |

### Hook Summary

| Event | Hooks | Purpose |
|-------|-------|---------|
| SessionStart | `init-status-v5.py` | Create status skeleton |
| UserPromptSubmit | `status-working.py`, `read-docs-trigger.py`, `skill-reminder.py` | Status + docs reminders |
| PostToolUse | `fleet-forward-hook-event.py` | Real-time Timeline updates |
| Stop | `status-stop.py` → `stop-validator.py` → `finalize-status-v5.py` → `ingest-status-v5.py` | Two-phase validation, AI analysis, ingestion |

### Network Ports

| Port | Service |
|------|---------|
| 4451 | REST API (Hono) |
| 4452 | Fleet Gateway (WebSocket) |
| 5173 | UI dev server |

---

## Related Documentation

- [Fleet DB Schema](fleet-db.md) - Database tables and relationships
- [Gateway Protocol](../api/gateway-protocol.md) - WebSocket message reference
- [Session Lifecycle](session-lifecycle.md) - Session states and compaction

---

## Source Files

| Component | Location |
|-----------|----------|
| Commander Session | `packages/daemon/src/gateway/commander-session.ts` |
| Fleet Prelude | `packages/daemon/src/gateway/fleet-prelude-builder.ts` |
| Status Watcher | `packages/daemon/src/status-watcher.ts` |
| Fleet DB Schema | `packages/daemon/src/fleet-db/schema.ts` |
| Ingestion API | `packages/daemon/src/routes/fleet.ts` |
