# Session Memories - Mimesis

## Documentation Structure

Documentation lives in `docs/` folder with `docs/index.md` as the entry point.

| Doc | Purpose |
|-----|---------|
| `docs/index.md` | Documentation hub - start here |
| `docs/getting-started.md` | Onboarding quickstart |
| `docs/cli-reference.md` | CLI commands and flags |
| `docs/ui-components.md` | React component hierarchy |
| `docs/operations/deployment.md` | Production deployment |
| `docs/operations/configuration.md` | Env vars and internal constants |
| `docs/api/daemon-api.md` | Daemon APIs (status-watcher, git, etc.) |
| `docs/guides/testing.md` | Manual testing strategies |

## CLI Flags

- `pnpm watch --recent` - Sessions from last 1 hour only (RECENT_THRESHOLD_MS = 3600000)
- `pnpm watch --active` - Non-idle sessions only

## Tech Stack

- Node.js 22.13.1, pnpm 10.26.0
- chokidar 4.0.3
- shadcn/ui + Tailwind CSS v4 (migrated from Radix UI Themes Jan 2026)
- TanStack Table v8 for DataTable
- Vite 7.2.4
- XState 5.25.0 for status machine

## Architectural Decisions

### XState for Status Detection
Status is derived via state machine (not imperative if/else) to handle edge cases:
- Stale message detection (pending tool_use older than 5s)
- Timeout fallbacks for older Claude Code versions
- Clean event-driven transitions

### Durable Streams for Real-time Sync
Port 4450 serves SSE stream that UI subscribes to via `@durable-streams/state`.
This allows multiple UI clients to stay in sync without polling.

### Centralized Configuration (config.ts)
All daemon constants live in `packages/daemon/src/config.ts`:
- Stream server config (STREAM_HOST, STREAM_PORT, STREAM_PATH)
- Timeout constants (IDLE_TIMEOUT_MS, APPROVAL_TIMEOUT_MS, STALE_TIMEOUT_MS)
- Summary cache limits and TTLs

This prevents magic numbers scattered across files and enables env var overrides.

### Utility Modules Pattern
Shared utilities live in `packages/daemon/src/utils/`:
- `timeout.ts` - withTimeout() wrapper for async operations
- `colors.ts` - ANSI codes for CLI output
- `errors.ts` - standardized error message extraction
- `type-guards.ts` - type narrowing guards (isUserEntry, isError, getErrorMessage)

### Summarizer Removal (Jan 2026)
AI summarizer module deleted entirely - goals/summaries now come from file-based status.

**Why removed:**
- File-based status from hooks provides deterministic goal/summary
- No ANTHROPIC_API_KEY required
- Eliminates "Goal generation timed out" warnings
- Simpler architecture: one source of truth

**Migration:** `server.ts` now uses `fileStatus?.task` for goal and `fileStatus?.summary` for summary, falling back to `originalPrompt` if no status file exists.

### Security: Command Injection Prevention
Use `execFile` with array args instead of `exec` with template strings:
```typescript
// Bad: execAsync(`gh pr list --head "${branch}"`)
// Good: execFileAsync("gh", ["pr", "list", "--head", branch])
```

### Kitty Terminal Control (Dual Port Architecture)
Daemon runs two HTTP servers on different ports:
- Port 4450: Durable Streams SSE (existing, one-way daemon→UI)
- Port 4451: Hono API for terminal control (new, request/response)

This separation was chosen because DurableStreamTestServer binds its own HTTP server, making port sharing impractical. The UI API client at `packages/ui/src/lib/api.ts` points to port 4451.

SQLite (better-sqlite3) chosen over in-memory storage for:
- Concurrent access from multiple UI clients
- Data persistence across daemon restarts
- Future extensibility (command history, preferences)

Terminal links sync to UI via Durable Streams by including `terminalLink` field in Session schema updates.

### Kitty Auto-Setup (Non-Invasive Config)
`kitty-setup.ts` automatically configures kitty remote control on daemon startup:
- Uses `socket-only` mode (secure, no passwords needed, filesystem permissions)
- Creates separate `claude-code.conf` via `include` directive (non-invasive)
- Sends SIGUSR1 to reload config without restart
- Creates `macos-launch-services-cmdline` for GUI launches on macOS

This approach was chosen over:
- Password mode: Requires manual password setup/env vars
- Direct kitty.conf modification: Risky, could break user config
- --override flags: Only work for terminal-launched kitty

### Embedded Terminals (Port 4452)
Browser-embedded xterm.js terminals via WebSocket + node-pty. Architecture decision: separate from kitty integration (not replacement).

**Why WebSocket over SSE:**
- Bidirectional: Terminal I/O requires both input and output streams
- Low latency: Critical for interactive terminal experience
- Separate port: Cannot share Durable Streams port (bound by DurableStreamTestServer)

**Why complement kitty (not replace):**
- Embedded: Quick interactions from UI, always available
- Kitty: Power users who prefer native terminal, persistent sessions across browser tabs

**Security model:**
- Localhost-only binding (127.0.0.1)
- Per-PTY token auth (UUID generated on create, required for WS upgrade)
- Session-scoped: Only spawns `claude --resume <sessionId>`

**Idle cleanup:** PTYs without active WS clients cleaned up after 30 min (PTY_IDLE_TIMEOUT_MS).

### Session Resume via Kitty
"Open in kitty" runs `claude --resume <sessionId> --dangerously-skip-permissions`:
- `--resume` continues the exact Claude Code session from its log file
- `--dangerously-skip-permissions` skips the folder trust prompt (user controls which sessions to open)
- Session IDs from our JSONL filenames match Claude Code's internal format

### Terminal Link Recovery (Cascading Fallback)
Kitty window IDs are ephemeral - they change on kitty restart or when other windows are created/destroyed. Solution: cascading recovery before each terminal operation:
1. Check if stored window ID exists (fast path)
2. Search by `user_vars.cc_session_id` (set via `--var` when launching)
3. Search by `--resume <sessionId>` in cmdline (fallback)
4. If not found, create new tab or return error

**Important limitation:** Cmdline search only works for windows launched via our "Open in Kitty" button. Windows started as normal shells show `/bin/zsh` in cmdline, not claude. User_vars is the reliable recovery method.

### Entry Limit to Prevent Memory Leaks
Sessions can have thousands of log entries over time. Without trimming, memory grows unbounded causing OOM kills (exit 137). Solution: `MAX_ENTRIES_PER_SESSION = 500` in config.ts, trimmed in watcher.ts. This is sufficient for status detection and summarization while preventing memory exhaustion.

### StreamDB Corruption Recovery (Auto-Recovery Jan 2026)
If durable-streams client shows `Symbol(liveQueryInternal)` errors, the stream data is corrupted. The system now automatically recovers:

**Auto-recovery flow:**
1. UI detects corruption error during `createStreamDB()` or `preload()`
2. UI calls `POST /api/v1/stream/reset` to daemon
3. Daemon pauses publishing, clears `~/.mimesis/streams/`, restarts stream server
4. Daemon republishes all cached sessions
5. UI retries connection (up to 3 attempts with exponential backoff)

**Key files:**
- `packages/ui/src/data/sessionsDb.ts` - Retry logic and corruption detection
- `packages/daemon/src/api/routes/stream.ts` - Reset endpoint
- `packages/daemon/src/server.ts` - `pause()`, `restart()`, `clearStreamData()` methods
- `packages/ui/src/routes/__root.tsx` - Error boundary and fallback UI

**Manual recovery (if auto-recovery fails):**
```bash
rm -rf ~/.mimesis/streams/
# Restart daemon
```

### File-Based Status System (Jan 2026)
Alternative to AI summaries for session status. Claude Code writes status to `.claude/status.md` via hooks, daemon watches and streams to UI.

**Why file-based over AI summaries:**
- Deterministic: Hooks provide exact paths/templates, model fills slots
- Scalable: Single file per project, always overwritten (no growth)
- Reliable: YAML frontmatter parsed deterministically vs LLM variability
- Cheaper: No API calls for status derivation

**Architecture:**
- `status-working.py` (UserPromptSubmit hook): Instructs model to write "working" status
- `status-stop.py` (Stop hook): Instructs model to write completion status
- `status-watcher.ts`: Watches `.claude/status.md` across projects
- `status-parser.ts`: Parses YAML frontmatter from status files
- `fileStatus` field in Session schema takes precedence when present and fresh

**Staleness:** Status files valid for 5 minutes (STATUS_FILE_TTL_MS), then falls back to XState derivation.

**Status taxonomy:** working, waiting_for_approval, waiting_for_input, completed, error, blocked, idle

## Documentation Audit (Jan 2026)

12 documentation fixes applied:
- Fixed broken link in `getting-started.md` (api/ui-components.md → ui-components.md)
- Updated SessionCard to module path in `ui-components.md`
- Updated summarizer to module path in `summarizer.md` and `CLAUDE.md`
- Added "Needs Approval" column to component hierarchy
- Documented debug endpoint `/api/debug/sessions` in `daemon-api.md`
- Documented session scoring algorithm in `ui-components.md`
- Documented parser API (tailJSONL, extractMetadata) in `daemon-api.md`
- Documented SessionWatcher API in `daemon-api.md`
- Added core type definitions (SessionState, StatusResult, LogEntry) to `daemon-api.md`
- Added database commands (db:generate, db:migrate, db:studio) to `cli-reference.md`
- Fixed TODO.md reference in CLAUDE.md → .claude/MEMORIES.md
- Deleted orphaned `packages/ui/README.md` (Vite template)

## Known Issues

### node-pty on macOS ARM64

The `node-pty` prebuilt binary's `spawn-helper` may lack execute permissions after pnpm install. Symptom: `posix_spawnp failed` error. Fix: `chmod +x node_modules/.pnpm/node-pty*/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper`. Consider adding a postinstall script if this recurs.

Also, node-pty spawns don't inherit shell PATH. Use full executable paths (e.g., `/opt/homebrew/bin/claude` not just `claude`). The `getClaudePath()` function in `pty.ts` handles this.

### WebSocket Server Path Matching

The `ws` WebSocketServer's `path` option only matches exact paths. Don't use `path: "/pty"` if you need `/pty/:id` - handle path validation in the connection handler instead.

### Browser/Node Module Isolation

Daemon modules imported by UI (via schema.ts) must not use `process.env` or other Node-only globals. The config barrel export (`config/index.ts`) re-exports all config modules including `stream.ts` which uses `process.env`. Solution: import specific config files directly (e.g., `config/content.ts`) instead of the barrel export when the importing module may run in browser context.

### xterm.js Renderer Initialization Timing

`fitAddon.fit()` must NOT be called immediately after `terminal.open()`. The xterm renderer initializes asynchronously after DOM attachment. Calling `fit()` too early causes: `TypeError: can't access property "dimensions", this._renderer.value is undefined`.

**Solution:** Wrap `fitAddon.fit()` in `requestAnimationFrame`:
```typescript
terminal.open(containerRef.current);
requestAnimationFrame(() => {
  if (terminalRef.current && fitAddonRef.current) {
    fitAddonRef.current.fit();
  }
});
```

### PTY API Idempotency (Terminal Latency)

The daemon's `POST /sessions/:id/pty` endpoint is **idempotent** - it returns existing PTY if found, or creates a new one. The UI was incorrectly calling `GET` first (which always failed for new sessions), then `POST`.

**Wrong pattern (2 round-trips):**
```typescript
let ptyInfo = await getPty(sessionId);    // Always fails for new sessions
if (!ptyInfo) {
  ptyInfo = await createPty(sessionId);   // Second roundtrip
}
```

**Correct pattern (1 round-trip):**
```typescript
const ptyInfo = await ensurePty(sessionId);  // Uses POST directly
```

This saves ~200-400ms per terminal load. The `ensurePty()` function in `api.ts` wraps this pattern.

### E2E Test Fixes (Jan 2026)

Flaky tests in `tracking.test.ts` were fixed:

**Root causes:**
- Tests created incomplete log entry sequences (missing `turn_duration` system entries)
- State machine requires TURN_END event to transition from `working` to `waiting_for_input`
- Tests expected pre-XState behavior where tool_use meant "working" (now it's "waiting_for_approval")
- Parallel tests interfered via shared module-level TEST_SESSION_ID variable
- ENOENT race condition: files deleted by afterEach before watcher could read them

**Fixes applied:**
- Added `createSystemEntry()` and `createToolResultEntry()` helper functions
- Added `turn_duration` system entries after assistant responses
- Updated expectations: tool_use → "waiting" with `hasPendingToolUse: true`
- Changed TEST_SESSION_ID from constant to per-test unique ID via `getTestSessionId()`
- Added ENOENT error handling in `watcher.ts` to gracefully ignore deleted files
- Skipped "should track message count changes" test - race conditions with other sessions in `~/.claude/projects/` make it too flaky

**Status:** 70 tests pass, 2 skipped. Consistent across multiple runs.

## QA Audit (Jan 2026)

Full audit in `~/.claude/plans/calm-hatching-toucan.md`. Key technical debt areas:

1. **Schema leakage**: 8 UI files directly import `packages/daemon/src/schema.ts` - tight coupling
2. **Duplicate schemas**: `FileStatusValueSchema` defined in both `schema.ts` and `status-parser.ts`
3. **Hardcoded tools**: Tool names scattered in 3 locations (server.ts, mockSessions.ts, constants.ts)
4. **Empty catches**: 18 empty catch blocks swallow errors silently (kitty-setup.ts, git.ts, pty.ts)

Technical debt score: MANAGEABLE. No circular dependencies. Codebase is healthy with specific improvement areas.

## Command Center UI Redesign (Jan 2026)

Full plan in `~/.claude/plans/zany-popping-dusk.md`.

### Problem Statement
Kanban boards are optimized for tracking work items, but we need to monitor live execution. Cards waste space, hide the terminal behind clicks, and don't scale beyond ~10 concurrent sessions. The terminal should be the primary instrument, not a detail view.

### Design Philosophy
Transform from "Kanban board" to "Mission Control" inspired by RTS games (StarCraft, Civ):
- **Persistent Terminal Dock** - always visible, selection-driven
- **Ops Table** - dense scannable list replacing cards
- **Keyboard-first** - muscle memory over mouse clicking
- **Attention system** - surface what needs intervention

### Key Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scale | 5-10 sessions | No virtualization needed, standard table |
| Backwards compat | Replace entirely | Clean slate, delete Kanban components |
| Terminal model | Selection-driven | Click row → terminal swaps, one at a time |
| Repo grouping | Flat list only | Repo as sortable column, no collapsible sections |

### New Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `OpsTable` | `components/ops-table/` | Dense session table with filtering/sorting |
| `OpsTableRow` | `components/ops-table/` | Individual session row with all columns |
| `StatusStrip` | `components/StatusStrip.tsx` | Clickable filter badges by status |
| `TerminalDock` | `components/terminal-dock/` | Persistent terminal panel |
| `SessionHeader` | `components/terminal-dock/` | Session info bar for dock |
| `useKeyboardNavigation` | `hooks/useKeyboardNavigation.ts` | RTS-style keyboard shortcuts |

### Deleted Components (Replaced)
- `RepoSection.tsx` - Replaced by flat Ops Table
- `KanbanColumn.tsx` - Replaced by Ops Table
- `SessionCard.tsx` - Replaced by OpsTableRow
- `SessionCardContent.tsx` - Replaced by OpsTableRow
- `SessionCardHoverContent.tsx` - Replaced by TerminalDock

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `↑/↓` | Navigate table rows |
| `Enter` | Select first session |
| `Escape` | Deselect / close terminal |
| `A` | Filter: all |
| `W` | Filter: working |
| `I` | Filter: needs input |
| `E` | Filter: errors |
| `S` | Filter: stale |

### Selection Model
Selection is lifted to `index.tsx` layout:
- `selectedSessionId` state controls both table highlighting and terminal display
- Click row → `setSelectedSessionId(session.sessionId)`
- Terminal swaps session without remounting (PTY lifecycle managed per session)

## Fleet Command UI Redesign (Jan 2026)

Full plan in `~/.claude/plans/nifty-petting-storm.md`.

### Problem Statement
The OpsTable/TerminalDock design still treated sessions as "tasks to manage" rather than "units to operate". The sliding terminal dock was hidden until clicked, breaking the "always-visible" principle. We needed a paradigm shift from **Project Management** to **Fleet Command**.

### Design Philosophy: "The Bridge"
Inspired by RTS games (StarCraft, Civilization) where you command units in real-time:
- Agents are **units** to monitor, not tasks to track
- Terminal is **always visible** - the primary instrument
- Click agent → terminal "tunes" to that frequency (instant swap)
- 4 static zones that never open/close (like a cockpit)

### 4-Zone Layout
| Zone | Component | Purpose |
|------|-----------|---------|
| A (Left) | Roster | High-density agent list with status indicators |
| B (Center) | Viewport | Persistent terminal that tunes to selected agent |
| C (Right) | Tactical Intel | Plan steps + modified artifacts |
| D (Bottom) | Event Ticker | Global event stream for cross-agent awareness |

### Mimesis Theme
Custom dark theme with industrial operator console aesthetic:
- Deep OLED blacks (`#09090b`, `#050505`) for true darkness
- Banana yellow accent (`#eab308`) for selection/active states
- Status colors: green (working), yellow (waiting), red (error)
- JetBrains Mono font for terminal consistency
- Plus Jakarta Sans for body text (loaded via Google Fonts in index.html, not fontsource)
- Subtle gradient overlays on zones for depth (not flat backgrounds)

### shadcn/ui + Tailwind Migration (Jan 2026)
Migrated from Radix UI Themes to shadcn/ui + Tailwind CSS v4.

**Why migrated:**
- Radix UI Themes limited customization (pre-styled, opinionated)
- shadcn/ui provides unstyled Radix primitives with Tailwind utilities
- TanStack Table offers better architecture for tables (column definitions, sorting)
- Tailwind v4 CSS-first config with `@theme` blocks

**Key changes:**
- DataTable replaces OpsTable (TanStack Table v8)
- shadcn components: Dialog, Button, DropdownMenu, Checkbox, Textarea
- CSS reduced from ~1,300 to ~770 lines
- Mimesis theme preserved via CSS custom properties

### Event Detection Algorithm
Events are generated by comparing previous session status to current:
```typescript
// Track previous statuses in useRef
// On session update: if status changed, emit event
// Event types: started, completed, waiting, error
```
This provides real-time cross-agent awareness without additional daemon work.

### Descoped Features
- Cost tracking (API costs per session) - not implemented
- Context health bars (token usage indicators) - not implemented

These were descoped to focus on core functionality. Can be added later if needed.

## Project Rebrand: Mimesis (Jan 2026)

Rebranded from "claude-code-ui" to "Mimesis".

**Why Mimesis:**
- Girardian philosophy: "mimesis" means imitation/mirroring
- The UI *mirrors* what sessions are doing (mimetic representation)
- Philosophically rich but not obscure
- Clean package names: `mimesis`, `@mimesis/daemon`, `@mimesis/ui`

**Migration:**
- New repo: `github.com/olivier-motium/mimesis` (not a fork)
- Data directory: `~/.mimesis/` (was `~/.claude-code-ui/`)
- Existing users: rename data dir or start fresh

## Session Deletion Feature (Jan 2026)

Added ability to permanently delete sessions from the UI via the actions dropdown menu.

**Implementation:**
- `DELETE /api/sessions/:id` endpoint in daemon
- `watcher.deleteSession(sessionId)` method deletes JSONL file and emits delete event
- UI actions menu has "Delete session" option (destructive styling)

**Why permanent deletion:**
- User requested ability to clean up duplicate/old sessions
- No soft-delete needed - sessions can always be re-created by running Claude Code again
- JSONL files are the source of truth, deleting the file is the clean approach

## Hook Enforcement for Status Files (Jan 2026)

Fixed the issue where Claude ignored status file instructions despite hook system being in place.

**Root cause:** Status hooks (`status-working.py`, `status-stop.py`) used exit code 0 (advisory only). Claude prioritizes user requests over system reminders, so status files were often skipped.

**Solution:** Modified `stop-validator.py` to verify `.claude/status.md` exists and is recent (< 5 minutes old) BEFORE the `stop_hook_active` escape hatch. Now Claude cannot stop without writing a status file.

**Key code change in stop-validator.py:**
```python
# Check status file BEFORE stop_hook_active check
status_ok, status_msg = check_status_file(cwd)
if not status_ok:
    print(block_message, file=sys.stderr)
    sys.exit(2)

# Only THEN allow escape hatch
if stop_hook_active:
    sys.exit(0)
```

**Why this works:**
- Status check happens before escape hatch, not after
- Even on second stop attempt, Claude must have fresh status file
- Enforced at stop time (critical moment) rather than on every prompt

**Files modified:**
- `~/.claude/hooks/stop-validator.py` - Added `check_status_file()` function
- `~/.claude/hooks/status-working.py` - Strengthened language (MANDATORY, MUST)
- `~/.claude/hooks/status-stop.py` - Strengthened language

## Session Deduplication by CWD (Jan 2026)

**Problem:** Multiple rows showed identical Goal/Summary but different ages.

**Root cause:** `.claude/status.md` is per-project (cwd), not per-session. Claude Code creates new session files (e.g., via compact feature), but all sessions from the same project directory share ONE status.md file. This causes all sessions to appear identical in the UI.

**Solution:** Deduplicate sessions by `cwd` in `useSessions.ts`:
```typescript
const sessionsByCwd = new Map<string, Session>();
for (const session of sessionsWithStatus) {
  const existing = sessionsByCwd.get(session.cwd);
  if (!existing || session.lastActivityAt > existing.lastActivityAt) {
    sessionsByCwd.set(session.cwd, session);
  }
}
const sessions = Array.from(sessionsByCwd.values());
```

**Why this approach:**
- Matches user mental model: one row per project
- Most recent session is the "active" one
- Older session files still exist but aren't shown (can be cleaned up with delete)
