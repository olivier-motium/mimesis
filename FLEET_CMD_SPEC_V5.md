# Fleet Commander v5: SQLite Briefing Ledger + Headless Streaming Gateway

**Version:** 5.0
**Status:** Draft
**Updated:** 2026-01-11
**Design Principle:** Bet on **model intelligence** for meaning (briefings, skills, docs). Bet on **determinism** for execution, storage, and orchestration.

---

## 1. Executive Summary

Fleet Commander v5 is a multi-project “control plane” that:

1. **Forces every worker session to end with a structured, verbose “briefing status file”** (`.claude/status.md`), pre-populated deterministically and finalized semantically (Sonnet).
2. **Deterministically ingests the briefing into a central SQLite ledger** (`fleet.db`), producing durable history and a reliable queue/outbox.
3. **Streams live LLM output to the UI using headless Claude Code invocations** (`claude -p`) with streaming output (`--output-format stream-json`, optionally `--include-partial-messages`). ([Claude Code][1])
4. Lets the **Commander (Opus)** be the user-facing “single point of contact,” while **Sonnet** handles maintenance (briefing drafting, skill/doc patch proposals).

Importantly: **the UI is not a terminal**. The UI receives **structured streaming events** from headless runs and renders them as a timeline/chat.

---

## 2. Roles and Model Routing

### 2.1 Control plane vs data plane

* **Workers (per repo)**: Do implementation work, run tests, commit, and produce a final briefing.
* **Commander (global)**: Reads the SQLite ledger + skills store; answers cross-project questions; decides which maintenance actions to run.

### 2.2 Model allocation

| Function                                             | Primary model | Rationale                                                                            |
| ---------------------------------------------------- | ------------: | ------------------------------------------------------------------------------------ |
| Worker implementation (coding tasks)                 |      **Opus** | Highest capability for multi-step engineering work                                   |
| Briefing writing (end-of-session status)             |    **Sonnet** | “Maintenance writing”: semantic summarization, doc drift judgment, structured output |
| Skill updates / doc drift patches                    |    **Sonnet** | Ongoing knowledge hygiene, cheaper + fast, improves as models improve                |
| Commander user interaction + cross-project reasoning |      **Opus** | Complex synthesis + planning                                                         |

Claude Code CLI explicitly supports selecting models via `--model` (`sonnet`, `opus`). ([Claude Code][1])

---

## 3. Core Contract: The Briefing Status File

### 3.1 Why the status file is the briefing

Instead of inventing a second artifact (“briefing.md”), the worker’s stop flow produces a **single canonical “briefing snapshot”**:

* **Human-readable markdown**
* **Machine-readable YAML front matter**
* Deterministically ingestible into SQLite

### 3.2 File location

* Worker repo: `<repo_root>/.claude/status.md`

### 3.3 Schema: `status.v5`

**YAML front matter is the API.** The markdown body is for humans.

```markdown
---
schema: status.v5

# identity
project_id: my-app__a1b2c3d4
repo_name: my-app
repo_root: /Users/olivier/projects/my-app
git_remote: git@github.com:motium/my-app.git
branch: feature/auth

# session + task
session_id: 550e8400-e29b-41d4-a716-446655440000
task_id: 2026-01-11T0900Z__auth__01
status: completed   # completed|blocked|failed|waiting_for_input
started_at: 2026-01-11T09:00:00Z
ended_at: 2026-01-11T09:42:12Z

# semantic fields (Sonnet-authored)
impact_level: moderate       # trivial|minor|moderate|major
broadcast_level: highlight   # silent|mention|highlight
doc_drift_risk: high         # low|medium|high

# traceability
base_commit: 1a2b3c4
head_commit: 5d6e7f8

# structured lists (Sonnet-authored; deterministic types)
blockers:
  - Waiting on OAuth client ID from ops

next_steps:
  - Add login route tests
  - Update docs/auth.md

docs_touched:
  - docs/auth.md

files_touched:
  - src/auth/*
---
# Briefing

## Summary
(sonnet) One paragraph: what changed and why.

## Business Impact
(sonnet) What does this enable/fix for users?

## Technical Notes
(sonnet) Key decisions, patterns, gotchas.

## Risks / Doc Drift
(sonnet) What might now be stale? Why?

## Suggested Follow-ups
(sonnet) Concrete follow-ups (not vague).
```

---

## 4. Deterministic Ledger: SQLite as the Source of Truth

### 4.1 Why SQLite (vs JSONL)

* **Atomicity & consistency**: single-transaction ingestion of a briefing + outbox event.
* **Concurrency**: multiple repos finishing simultaneously; SQLite WAL handles concurrent writers well in practice.
* **Queryable**: “show last 24h activity”, “projects with doc drift high”, “search for jose usage”.
* **Queue-ready**: jobs table + outbox table = reliable orchestration.

### 4.2 Database location

* `~/.claude/commander/fleet.db`

### 4.3 Minimal schema

#### projects

```sql
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  repo_name TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  git_remote TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active|idle|archived
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### briefings (durable history)

```sql
CREATE TABLE IF NOT EXISTS briefings (
  briefing_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(project_id),

  session_id TEXT,
  task_id TEXT,
  status TEXT NOT NULL,

  started_at TEXT,
  ended_at TEXT,

  impact_level TEXT,
  broadcast_level TEXT,
  doc_drift_risk TEXT,

  base_commit TEXT,
  head_commit TEXT,
  branch TEXT,

  blockers_json TEXT,        -- JSON array
  next_steps_json TEXT,      -- JSON array
  docs_touched_json TEXT,    -- JSON array
  files_touched_json TEXT,   -- JSON array

  raw_markdown TEXT NOT NULL, -- original status.md content
  created_at TEXT NOT NULL,

  -- idempotency: one final briefing per session/task
  UNIQUE(project_id, session_id, task_id, ended_at)
);
```

#### outbox_events (push + replay)

```sql
CREATE TABLE IF NOT EXISTS outbox_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,         -- briefing_added|skill_updated|error|job_completed|...
  project_id TEXT,
  briefing_id INTEGER,
  payload_json TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_outbox_undelivered
  ON outbox_events(delivered, event_id);
```

#### jobs (future-proof dispatch + maintenance)

```sql
CREATE TABLE IF NOT EXISTS jobs (
  job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_created TEXT NOT NULL,
  ts_started TEXT,
  ts_finished TEXT,

  type TEXT NOT NULL,          -- worker_task|skill_patch|doc_patch|fleet_digest|...
  project_id TEXT,
  repo_root TEXT,

  model TEXT NOT NULL,         -- opus|sonnet|haiku
  status TEXT NOT NULL,        -- queued|running|completed|failed|canceled

  request_json TEXT NOT NULL,  -- input payload (prompt + constraints)
  result_json TEXT,            -- output payload (structured)
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_queue
  ON jobs(status, ts_created);
```

---

## 5. Worker-Side Hooks: Deterministic Shell + Sonnet Authorship

Claude Code hooks are configured in settings files and run commands with JSON stdin. ([Claude Code][2])
You can keep this within your existing toolkit hook framework.

### 5.1 Hook goals

* **SessionStart / UserPromptSubmit**: deterministically pre-populate `.claude/status.md` skeleton (`status.v5`)
* **Stop**: ensure final briefing is valid + ingest into SQLite

### 5.2 `init-status-v5.py` (deterministic pre-population)

Triggered on SessionStart (or first user prompt). Responsibilities:

* compute `project_id` deterministically
* set `session_id` (UUID)
* set `task_id` (timestamp-based)
* write `.claude/status.md` if missing, or update “started_at/task” fields

Use `CLAUDE_PROJECT_DIR` for stable paths in hooks. ([Claude Code][2])

### 5.3 `finalize-status-v5.py` (Sonnet-authored semantic fill)

Triggered on Stop (first attempt). Responsibilities:

1. Collect deterministic context:

   * `git rev-parse HEAD`, branch, remote
   * `git diff <base_commit>..HEAD` or “since session start”
   * touched files list
2. Run **headless Sonnet** to draft the semantic fields (summary, impact, doc drift, etc.)
3. Write the fully-populated `.claude/status.md`
4. Validate schema + required fields
5. Call ingestion

**Headless call uses CLI print mode** (`-p`) and can produce structured outputs (`--json-schema`) and/or streaming output formats. ([Claude Code][1])

> Note: do NOT rely on line-count heuristics for “big vs small.” Sonnet assigns impact/doc drift.

### 5.4 `ingest-status-v5.py` (deterministic ingestion)

Triggered after finalize success.

Steps:

* Parse YAML front matter + markdown
* Validate required keys + enum values
* Transaction:

  1. upsert projects row
  2. insert briefings row (idempotent via unique)
  3. insert outbox event `briefing_added`

If ingestion fails, write an outbox `error` event.

---

## 6. Fleet Gateway: Headless Streaming to UI (No PTY)

### 6.1 What the gateway is

A local daemon (Node or Python) that:

* tails `fleet.db` outbox and pushes events to the UI
* runs **headless Claude Code jobs** (`claude -p`) and streams their output to UI
* manages concurrency, retries, and job lifecycle state in SQLite

### 6.2 Why headless `claude -p`

Claude Code supports print mode `-p` and streaming output format `stream-json`. ([Claude Code][1])
For UI rendering, we treat every headless run as a **job stream**.

Key CLI building blocks:

* `claude -p "prompt"`: non-interactive run ([Claude Code][1])
* `--output-format stream-json`: stream machine-readable events ([Claude Code][1])
* `--include-partial-messages`: include partial streaming events (works with stream-json) ([Claude Code][1])
* `--json-schema`: validated structured output after tool workflow completes ([Claude Code][1])
* `--max-turns`: cap autonomous loops ([Claude Code][1])
* `--model sonnet|opus`: explicit model selection ([Claude Code][1])
* `--resume/-r` and `--continue/-c`: optional conversation reuse ([Claude Code][1])

### 6.3 Gateway responsibilities

#### A) Outbox tailer → UI push

* Maintain `last_delivered_event_id`
* Poll `outbox_events WHERE delivered=0 ORDER BY event_id`
* Send events to UI
* Mark delivered

This gives:

* durability (events persist)
* replay (UI reconnect can request from cursor)

#### B) Job runner

* Poll `jobs WHERE status='queued' ORDER BY ts_created`
* Mark job running
* Execute `claude -p ...` subprocess
* Stream stdout lines to UI (each line is JSON when `--output-format stream-json`)
* On completion:

  * parse final structured output (if using json-schema)
  * store result_json + status
  * write outbox `job_completed` or `error`

#### C) Concurrency + fairness

* Configurable `max_concurrent_jobs`
* Per-project concurrency cap (avoid 5 jobs hammering one repo)
* Backoff and retry policies

---

## 7. UI ⇄ Gateway Protocol (WebSocket)

### 7.1 UI subscribes to fleet events

```json
{ "type": "fleet.subscribe", "from_event_id": 0 }
```

Gateway emits:

```json
{
  "type": "fleet.event",
  "event_id": 812,
  "ts": "2026-01-11T09:42:20Z",
  "event": {
    "type": "briefing_added",
    "project_id": "my-app__a1b2c3d4",
    "briefing_id": 123,
    "impact_level": "moderate",
    "doc_drift_risk": "high",
    "summary": "Added OAuth middleware skeleton and env config."
  }
}
```

### 7.2 UI starts a headless “conversation turn” (Commander chat)

```json
{
  "type": "job.create",
  "job": {
    "type": "commander_turn",
    "model": "opus",
    "project_id": null,
    "repo_root": "/Users/olivier/Desktop/motium_github/mimesis",
    "request": {
      "prompt": "What's happening across my projects in the last 24 hours?",
      "context_policy": "db_summary_plus_skills"
    }
  }
}
```

Gateway inserts a `jobs` row and begins running it.

### 7.3 UI receives streaming output

Gateway streams every line/object from `claude -p --output-format stream-json ...` as:

```json
{ "type": "job.started", "job_id": 456 }

{ "type": "job.stream", "job_id": 456, "seq": 1, "chunk": { "...": "..." } }
{ "type": "job.stream", "job_id": 456, "seq": 2, "chunk": { "...": "..." } }

{ "type": "job.completed", "job_id": 456, "ok": true }
```

**UI renders this as a timeline**, not a terminal:

* tool steps
* partial assistant text
* final result

### 7.4 Cancel / stop a job

```json
{ "type": "job.cancel", "job_id": 456 }
```

Gateway sends SIGINT then SIGTERM if needed and marks job canceled.

---

## 8. Commander Logic: Skill Drift + Maintenance via Sonnet

### 8.1 Commander “read-only overseer” behavior (POC)

When a `briefing_added` event arrives:

* UI displays the briefing summary immediately (no need to “inject into a running terminal session”).
* Commander (Opus) can answer questions by reading:

  * `fleet.db` for recent briefings
  * `skills/projects/<project_id>/SKILL.md` for long-term context

### 8.2 Skill update decision

When a new briefing is ingested, Commander evaluates:

* Does the briefing introduce a new subsystem, pattern, dependency, invariant?
* Does it change “how the project works” or “how to operate/debug it”?
* Is the skill now misleading/stale?

If **yes**, Commander triggers a Sonnet maintenance job:

* `type = skill_patch`
* `model = sonnet`
* input = `{ project_id, briefing_id, skill_path }`

### 8.3 Deterministic patch application

To preserve human-authored stability, SKILL.md uses explicit boundaries:

* “REWRITABLE” blocks (Sonnet can replace fully)
* “APPEND-ONLY” block for Recent Activity

Example structure:

```markdown
## Overview
<!-- BEGIN:REWRITABLE:OVERVIEW -->
...
<!-- END:REWRITABLE:OVERVIEW -->

## Recent Activity
<!-- BEGIN:APPEND:RECENT_ACTIVITY -->
- ...
<!-- END:APPEND:RECENT_ACTIVITY -->
```

Sonnet outputs a patch proposal (structured JSON), gateway applies it deterministically, writes file, and emits outbox `skill_updated`.

---

## 9. Headless Job Patterns (Canonical Invocations)

### 9.1 Streaming Commander turn (Opus)

```bash
claude -p \
  --model opus \
  --output-format stream-json \
  --include-partial-messages \
  --max-turns 6 \
  "Answer using the DB summary and per-project skills..."
```

Streaming output + partial messages is supported when using print mode with stream-json. ([Claude Code][1])

### 9.2 Structured maintenance (Sonnet) with schema

```bash
claude -p \
  --model sonnet \
  --output-format stream-json \
  --include-partial-messages \
  --json-schema @/home/user/.claude/commander/schemas/skill_patch.json \
  --max-turns 4 \
  "Given SKILL.md and briefing #123, propose updates within markers only."
```

The CLI supports validated JSON schema outputs in print mode. ([Claude Code][1])

---

## 10. Reliability and Concurrency

### 10.1 Multiple repos finishing at once

* Workers ingest into SQLite concurrently
* SQLite is authoritative and serializes writes safely
* Outbox ensures **no lost notifications** even if the gateway is down

### 10.2 Idempotency

* `briefings` unique constraint prevents duplicates
* Ingestion must be safe to rerun

### 10.3 Crash recovery

* If gateway dies mid-job:

  * job remains `running` with stale timestamp
  * on restart, mark stale running jobs as `failed` and retry if policy allows
* If UI disconnects:

  * gateway keeps running
  * UI reconnects and replays outbox events from cursor

---

## 11. Security and Permissions

### 11.1 Hook safety

Hooks are powerful; follow the documented safety guidance:

* validate and sanitize inputs
* quote shell variables
* avoid sensitive paths
* prefer absolute paths and `CLAUDE_PROJECT_DIR` ([Claude Code][2])

### 11.2 Headless job permissions

Use Claude Code permission mechanisms and/or tool restrictions:

* `--tools` can restrict tools available (e.g. `"Bash,Edit,Read"`). ([Claude Code][1])
* `--allowedTools` / `--disallowedTools` can fine-tune tool rules in a job. ([Claude Code][1])
* Settings files support allow/deny patterns for sensitive files (e.g. `.env`). ([Claude Code][3])

### 11.3 Secret redaction in streaming

Gateway should implement a redaction layer before emitting to UI:

* redact `.env`-looking strings, tokens, private keys
* optionally suppress raw Bash outputs for commands that might contain secrets

---

## 12. File Layout

```text
~/.claude/
  commander/
    fleet.db
    schemas/
      skill_patch.json
      doc_patch.json
    skills/
      projects/<project_id>/SKILL.md
    gateway/
      gatewayd            # daemon (or node/python service)
      state.json          # cursors, config
  hooks/
    init-status-v5.py
    finalize-status-v5.py
    ingest-status-v5.py
```

Worker repos:

```text
<repo_root>/
  .claude/
    status.md
    settings.json
    MEMORIES.md
  docs/
    index.md
```

---

## 13. Implementation Phases

### Phase 1 — Status.v5 + ingestion (the “ledger backbone”)

* [ ] `init-status-v5.py` writes status skeleton deterministically
* [ ] `finalize-status-v5.py` calls Sonnet to fill semantic sections
* [ ] `ingest-status-v5.py` inserts into SQLite + outbox event

### Phase 2 — Gateway (outbox → UI)

* [ ] Outbox tailer with cursor + replay
* [ ] WebSocket `fleet.subscribe` and `fleet.event`

### Phase 3 — Headless job streaming to UI

* [ ] `jobs` table + runner loop
* [ ] spawn `claude -p --output-format stream-json`
* [ ] stream to UI as `job.stream`

### Phase 4 — Commander + skill maintenance

* [ ] Commander “turn job” (Opus) reads DB + skills
* [ ] Sonnet maintenance jobs produce skill patches
* [ ] Deterministic patcher updates SKILL.md + outbox `skill_updated`

### Phase 5 — Dispatch (future, but architected now)

* [ ] Commander creates `worker_task` jobs for specific repos
* [ ] Gateway runs Opus worker tasks headless and streams progress
* [ ] Worker stop flow produces status briefing → SQLite ingest → fleet event

---

## 14. What This Spec Explicitly Avoids

* **No PTY terminal embedding** in the UI.
* No “magic file-changed hooks” required for commander updates (SQLite outbox is the queue).
* No brittle “diff line count = big task” logic.
* No dependence on Opus for maintenance writing (Sonnet owns it).

---

If you want, I can also include (in the same v5 doc) a concrete **JSON schema** for:

* the Sonnet “finalize status.v5” structured output, and
* the Sonnet “skill_patch” output,
  so your patchers and ingestors are completely deterministic end-to-end.

[1]: https://code.claude.com/docs/en/cli-reference "CLI reference - Claude Code Docs"
[2]: https://code.claude.com/docs/en/hooks "Hooks reference - Claude Code Docs"
[3]: https://code.claude.com/docs/en/settings "Claude Code settings - Claude Code Docs"
