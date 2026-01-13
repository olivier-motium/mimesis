# Documentation Audit Report: Commander Focus

**Generated:** 2026-01-13
**Scope:** Full documentation inventory with Commander architecture focus
**Methodology:** Parallel agents for inventory, code coverage, and staleness detection

---

## Part A: Documentation Inventory

### Summary Statistics

| Metric | Count |
|--------|-------|
| Total .md files | 233 |
| Commander-related docs | 18 |
| Root-level docs | 8 |
| docs/ folder docs | 47 |
| Package docs | 12 |
| Reference docs (PydanticAI, Logfire, claude-code) | 166 |

### Commander-Related Documentation

| File | Purpose | Status |
|------|---------|--------|
| `docs/architecture/commander.md` | Core Commander architecture | **STALE** - PTY vs Headless contradiction |
| `docs/architecture/fleet-db.md` | Fleet DB schema | **STALE** - Missing broadcast_level |
| `docs/api/gateway-protocol.md` | WebSocket protocol | **UP TO DATE** |
| `docs/api/endpoints.md` | REST API reference | **MINOR GAPS** |
| `docs/architecture/session-lifecycle.md` | Session states, compaction | **UP TO DATE** |
| `.claude/MEMORIES.md` | Session context/decisions | **UP TO DATE** |
| `CLAUDE.md` | Coding standards | **UP TO DATE** |
| `docs/index.md` | Documentation hub | **UP TO DATE** |

### Broken Links

**None detected** - All internal documentation links resolve correctly.

---

## Part B: Structural Recommendations

### Current Structure (Satisfactory)

```
docs/
├── index.md                    # Entry point - well-maintained
├── architecture/
│   ├── commander.md           # Needs update
│   ├── fleet-db.md            # Needs update
│   ├── gateway.md             # Up to date
│   ├── session-lifecycle.md   # Up to date
│   └── configuration-reference.md
├── api/
│   ├── gateway-protocol.md    # Up to date
│   ├── endpoints.md           # Minor gaps
│   └── daemon-api.md
├── operations/
│   ├── deployment.md
│   ├── configuration.md
│   └── telemetry.md
└── guides/
    └── testing.md
```

### Recommendations

1. **No structural changes needed** - Hierarchy is logical and well-organized
2. **Consider**: Adding `docs/architecture/hook-system.md` for comprehensive hook documentation (currently scattered in commander.md)

---

## Part C: Content Findings

### Critical: Commander Architecture Contradiction

**Location:** `docs/architecture/commander.md:196-232` vs `.claude/MEMORIES.md:1349-1531`

**Issue:** The commander.md document describes **headless mode** with `claude -p`:
```
Build command: claude -p "<prompt>" --resume <id> --dangerously-skip-permissions
```

But MEMORIES.md documents a **PTY-based architecture** transformation:
```
Transform Commander from headless jobs to a **persistent PTY session** running interactive `claude`.
```

**Actual state (per code analysis):** Commander now uses PTY-based sessions, not headless `claude -p`. The commander.md is stale.

**Fix required:** Rewrite commander.md "Commander Session" section to describe PTY-based architecture:
- Remove headless mode description
- Document `CommanderSessionManager` class
- Document prompt queue with status-based draining
- Update command to interactive `claude` (not `claude -p`)

---

### High: Missing broadcast_level Documentation

**Location:** `docs/architecture/fleet-db.md:105-129`

**Issue:** The outbox_events schema documentation is missing the `broadcast_level` column added in the Commander Event Architecture refactor.

**Current documentation:**
```sql
CREATE TABLE outbox_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  project_id TEXT,
  briefing_id INTEGER,
  payload_json TEXT NOT NULL,
  delivered INTEGER DEFAULT 0
);
```

**Missing column:**
```sql
broadcast_level TEXT  -- silent | mention | highlight
```

**Fix required:** Add broadcast_level column to schema documentation and document its purpose for prelude compaction filtering.

---

### High: Missing Event Types in fleet-db.md

**Location:** `docs/architecture/fleet-db.md:121-128`

**Issue:** Only 4 event types documented, but 3 new types exist:

**Documented:**
- `briefing_added`
- `skill_updated`
- `job_completed`
- `error`

**Missing:**
- `session_started` - Session begins (broadcast_level: silent)
- `session_blocked` - Session blocked on dependency
- `doc_drift_warning` - High doc drift risk detected

**Fix required:** Add new event types to Event Types table.

---

### High: FleetPreludeBuilder Compaction Algorithm Undocumented

**Location:** Should be in `docs/architecture/commander.md`

**Issue:** The prelude compaction algorithm is not documented anywhere. This is a critical component for preventing Commander context overflow.

**Algorithm (from code):**
1. Alerts (blocked/failed/errors/doc-drift): Always included
2. Highlights: Max 1 per project (newest wins)
3. Mentions: Capped at 10 total (newest first)
4. Silent: Skipped entirely

**Fix required:** Add "Fleet Prelude Compaction" section to commander.md documenting the algorithm, constants (`MAX_MENTIONS_PER_PRELUDE = 10`), and rationale.

---

### Medium: Missing REST Endpoints

**Location:** `docs/api/endpoints.md`

**Issue:** Several endpoints not documented:

| Endpoint | Purpose |
|----------|---------|
| `POST /fleet/session-start` | Session start notification from hook |
| `GET /fleet/conversations` | Commander conversation history |
| `POST /fleet/conversations` | Create conversation record |

**Fix required:** Add missing endpoint documentation.

---

### Medium: ConversationRepo Undocumented

**Location:** Should be in `docs/architecture/fleet-db.md`

**Issue:** The `conversations` table is shown in the architecture diagram but has no schema documentation or API reference.

**Table schema (from code):**
```sql
CREATE TABLE conversations (
  conversation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  started_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  turn_count INTEGER DEFAULT 0,
  context_json TEXT
);
```

**Fix required:** Add Conversations Table section to fleet-db.md with schema and ConversationRepo API.

---

### Low: Stale Environment Variables in configuration.md

**Location:** `docs/operations/configuration.md`

**Issue:** Documents `STREAM_HOST`, `PORT`, `VITE_STREAM_URL` environment variables that were removed with Durable Streams.

**Fix required:** Remove stale env vars or mark as deprecated.

---

### Low: getting-started.md Still References Kanban

**Location:** `docs/getting-started.md:36-51`

**Issue:** Describes obsolete "Kanban-style board" UI instead of current 3-column Fleet Command layout (Roster, Timeline, Tactical Intel).

**Fix required:** Update UI description to match current layout.

---

## Part D: Proposed Documentation Updates

### Priority 1: Critical (Should be done immediately)

| File | Change |
|------|--------|
| `docs/architecture/commander.md` | Rewrite "Commander Session" section for PTY-based architecture |
| `docs/architecture/fleet-db.md` | Add broadcast_level column, new event types, conversations table |

### Priority 2: High (Should be done this week)

| File | Change |
|------|--------|
| `docs/architecture/commander.md` | Add "Fleet Prelude Compaction" section |
| `docs/api/endpoints.md` | Add missing fleet endpoints |

### Priority 3: Medium (Should be done soon)

| File | Change |
|------|--------|
| `docs/getting-started.md` | Update UI description |
| `docs/operations/configuration.md` | Remove stale env vars |

---

## Part E: Summary Statistics

| Category | Count |
|----------|-------|
| Critical issues | 1 |
| High priority issues | 3 |
| Medium priority issues | 3 |
| Low priority issues | 2 |
| Broken links | 0 |
| Missing doc files | 0 |

### Code Coverage Estimates

| Package | Documented Modules | Total Modules | Coverage |
|---------|-------------------|---------------|----------|
| Daemon | ~12 | ~28 | ~43% |
| UI | ~8 | ~15 | ~53% |
| **Overall** | ~20 | ~43 | ~47% |

### Documentation Health Score

**B+ (Good with notable gaps)**

**Strengths:**
- Clear documentation hierarchy with index.md hub
- Gateway protocol fully documented
- Session lifecycle well-explained
- MEMORIES.md captures architectural decisions

**Weaknesses:**
- Commander architecture stale (headless vs PTY mismatch)
- Recent schema changes not propagated to docs
- ConversationRepo completely undocumented

---

## Recommended Actions

1. **Immediate:** Fix commander.md PTY vs headless contradiction
2. **This session:** Update fleet-db.md with broadcast_level and new event types
3. **Follow-up:** Document FleetPreludeBuilder compaction algorithm
4. **Backlog:** Full ConversationRepo documentation

---

*Report generated by documentation audit agents*
