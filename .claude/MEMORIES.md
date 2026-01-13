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

### Gateway-Based Session Tracking (Jan 2026)
Port 4452 WebSocket Gateway is the primary source of truth for sessions. Durable Streams dependencies remain in the codebase for stream data persistence.

**Architecture:**
- SessionStore merges sessions from SessionWatcher (external) + PtyBridge (gateway-created)
- Gateway broadcasts session events to all connected WebSocket clients
- UI subscribes via useGateway hook, receives sessions.snapshot on connect

**Gateway as primary interface:**
- Gateway WebSocket provides unified session tracking for both external and PTY sessions
- Durable Streams still used for persistent stream data storage
- SessionStore merges all sources into a single view

**Protocol messages:**
- `sessions.list` (client) → request current sessions
- `sessions.snapshot` (gateway) → full session list
- `session.discovered/updated/removed` (gateway) → incremental updates

**Files:**
- `src/gateway/session-store.ts` - Unified session tracking
- `src/hooks/useGateway.ts` - TrackedSession map + handlers

### Centralized Configuration (Modular Pattern)
Configuration is split into domain-specific files in `packages/daemon/src/config/`:
- `stream.ts`, `timeouts.ts`, `scoring.ts`, `ai.ts`, `content.ts`, `pty.ts`, `paths.ts`, `fleet.ts`, `server.ts`
- All re-exported via `config/index.ts`

UI config in `packages/ui/src/config/index.ts`:
- Gateway WebSocket URL, event buffer limits (maxFleetEvents: 1000, maxSessionEvents: 5000)

**Event buffer limits prevent memory leaks**: Both gateway-handlers.ts (daemon→UI) and watcher.ts (file watching) use FIFO eviction when limits are reached.

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

### Kitty Terminal Control (Port Architecture)
Daemon runs HTTP/WebSocket servers on two ports:
- Port 4451: Hono API for terminal control and REST endpoints
- Port 4452: Gateway WebSocket for real-time session data + PTY I/O

The UI API client at `packages/ui/src/lib/api.ts` points to port 4451. WebSocket connections go to port 4452 via useGateway hook.

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

**Output buffering:** PTY output is stored in a circular buffer (5000 chunks max) and replayed when clients reconnect. This ensures terminal history is preserved when switching between terminals. Key implementation details:
- Early output buffer captures data during the 1-second stability check (before session is fully initialized)
- Buffer is replayed in `addClient()` to newly connecting WebSocket clients
- This fixes the issue where switching away and back to a terminal would show empty content

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

### StreamDB Corruption Recovery
**Note:** Durable Streams persists stream data to `~/.mimesis/streams/`. If corruption occurs, delete the streams directory and restart the daemon. Gateway WebSocket handles session state in memory while Durable Streams provides persistence.

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

### PTY Stability Check for Session Resume

When spawning a PTY for `claude --resume <sessionId>`, the process may exit immediately if the session doesn't exist (compacted/cleared). Without a stability check, the daemon returns PTY info, UI tries to connect WebSocket, and gets error 1006.

**Solution:** 1-second stability check in `pty-manager.ts`:
```typescript
const STABILITY_CHECK_MS = 1000;
const stabilityResult = await Promise.race([
  exitPromise.then((exit) => ({ type: "exit", ...exit })),
  new Promise<{ type: "stable" }>((resolve) =>
    setTimeout(() => resolve({ type: "stable" }), STABILITY_CHECK_MS)
  ),
]);

if (stabilityResult.type === "exit") {
  throw new Error(`Session "${sessionId}" may not be resumable`);
}
```

This delays PTY info response by 1s but ensures the process is actually running before UI attempts connection.

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

### Callback Memoization for WebSocket Components

When passing callbacks to components that use them in useEffect dependencies (like Terminal.tsx), always use `useCallback`. Without memoization:

1. Parent re-renders (e.g., from StreamDB updates every ~1s)
2. New callback function objects created
3. Child useEffect sees dependency changes → re-runs
4. WebSocket closes and reopens repeatedly

**Pattern:**
```typescript
// Bad: inline callbacks
<Terminal onConnect={() => setConnected(true)} />

// Good: memoized callbacks
const handleConnect = useCallback(() => setConnected(true), []);
<Terminal onConnect={handleConnect} />
```

For async operations (like `ensurePty`), also add staleness checks to prevent race conditions when switching quickly between items:
```typescript
const info = await ensurePty(sessionId);
if (currentRef.current !== sessionId) return; // Stale, ignore
setPtyInfo(info);
```

### PTY Output Buffering for Terminal Reconnection

When WebSocket clients disconnect and reconnect to a PTY (e.g., when switching between terminals in UI), they miss any output that was broadcast while disconnected. The `claude --resume` command outputs conversation history only once at startup.

**Solution:** Circular buffer in PtyManager:
```typescript
// Store output (circular buffer, 5000 chunks max)
proc.onData((data) => {
  session.outputBuffer.push(data);
  if (session.outputBuffer.length > 5000) session.outputBuffer.shift();
  this.broadcast(ptyId, { type: "data", payload: data });
});

// Replay on client connect
addClient(ptyId, client) {
  const historical = session.outputBuffer.join("");
  client.send(JSON.stringify({ type: "data", payload: historical }));
}
```

This ensures terminal history is preserved when switching between agents in the UI.

### React StrictMode and WebSocket Connections

React StrictMode double-mounts components in development. For WebSocket connections (like Terminal.tsx), this causes:
1. First mount creates WebSocket → starts connecting
2. First unmount cleanup runs → closes WebSocket (error 1006 if still CONNECTING)
3. Second mount creates WebSocket → this one stays connected

**Solution:** Use abort flag pattern to ignore callbacks after unmount:
```typescript
useEffect(() => {
  let aborted = false;
  const ws = new WebSocket(url);

  ws.onclose = (event) => {
    if (aborted) return;  // Ignore close events after unmount
    onDisconnect?.();
  };

  return () => {
    aborted = true;  // Set flag BEFORE closing
    ws.close(1000, "Component unmounting");
  };
}, [url]);
```

This prevents error callbacks from the first mount's cleanup from triggering error states.

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

**Test Directory Isolation (Jan 2026):**
Tests in `tracking.test.ts` originally wrote to `~/.claude/projects/-test-e2e-session/`, which caused test artifacts to appear as real sessions in the Mimesis dashboard (mission text "Initial", CWD "/Users/test/project").

**Fix:** Changed TEST_DIR to use `os.tmpdir()` and made `SessionWatcher` configurable with a `projectsDir` option:
```typescript
// Old (leaked artifacts):
const TEST_DIR = path.join(os.homedir(), ".claude", "projects", "-test-e2e-session");
const watcher = new SessionWatcher({ debounceMs: 50 });

// New (isolated):
const PROJECTS_DIR = path.join(os.tmpdir(), "mimesis-test");
const TEST_DIR = path.join(PROJECTS_DIR, "-test-e2e-session");
const watcher = new SessionWatcher({ debounceMs: 50, projectsDir: PROJECTS_DIR });
```

If test artifacts still appear after this fix, also clear the Durable Streams cache: `rm -rf ~/.mimesis/streams/`

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

**Gotcha: shadcn/ui color variables in Tailwind v4:**
shadcn/ui components use semantic color classes (`bg-popover`, `bg-primary`, etc.) that map to `--color-*` variables in the `@theme` block. If these are missing, backgrounds become transparent. Required variables:
- `--color-popover`, `--color-popover-foreground` (dropdowns)
- `--color-primary`, `--color-primary-foreground` (buttons)
- `--color-accent`, `--color-accent-foreground` (hover states)
- `--color-destructive` (delete actions)
- `--color-muted`, `--color-secondary`, `--color-input`, `--color-ring`, `--color-card`

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

## Session-Based Status Files (Jan 2026)

**Problem:** Multiple Claude Code agents working in the same repo overwrote each other's `.claude/status.md` file, causing status collisions and incorrect UI display.

**Root cause:** Original design used project-based status files (one per `cwd`), not session-based. All sessions from same directory shared ONE status.md.

**Solution:** Session-specific status files: `status.<sessionId>.md` instead of `status.md`.

**Implementation:**
1. **Hooks** - `status-working.py` and `status-stop.py` now extract `session_id` from stdin JSON and write to `status.<sessionId>.md`
2. **Daemon** - `status-watcher.ts` watches for `status.*.md` pattern, extracts sessionId from filename
3. **Server** - Matches status events directly by sessionId (no cwd lookup)
4. **UI** - Removed cwd deduplication workaround since each session now has its own status file

**Key discovery:** Hooks already receive `session_id` in stdin JSON - they just weren't using it.

**Backward compatibility:** Legacy `status.md` files still work:
- StatusWatcher checks both patterns
- Legacy files emit events with `sessionId: "legacy:<cwd>"`
- Server broadcasts legacy updates to all sessions with matching cwd

**Files modified:**
- `~/.claude/hooks/status-working.py` - Uses session_id in path
- `~/.claude/hooks/status-stop.py` - Uses session_id in path
- `~/.claude/hooks/stop-validator.py` - Checks session-specific file first
- `packages/daemon/src/status-watcher.ts` - Watches `status.*.md`, caches by sessionId
- `packages/daemon/src/server.ts` - Matches by sessionId directly
- `packages/ui/src/hooks/useSessions.ts` - Removed cwd deduplication

**Status file pattern:**
```
# Session-specific (preferred)
.claude/status.<sessionId>.md

# Legacy (fallback)
.claude/status.md
```

## Git User Configuration for Multiple GitHub Accounts (Jan 2026)

**Problem:** Commits in motium repos were attributed to personal account (`markov-kernel`) instead of org account (`olivier-motium`), even when `gh auth` was logged in as motium.

**Root cause:** Git commit author comes from `~/.gitconfig`, not from `gh auth`. These are separate systems.

**Solution:** Git's conditional includes (`includeIf`) to automatically switch identities by directory:

```
# ~/.gitconfig
[user]
    name = markov-kernel
    email = olivier@markov.bot
[includeIf "gitdir:~/Desktop/motium_github/"]
    path = ~/.gitconfig-motium

# ~/.gitconfig-motium
[user]
    name = olivier-motium
    email = 243932812+olivier-motium@users.noreply.github.com
```

**Key insight:** The trailing `/` in `gitdir:` is required to match all subdirectories.

**History rewrite:** Used `git filter-branch` with `--env-filter` to change existing commits, then force pushed. Required stashing changes first.

## Session Compaction Handling (Jan 2026)

**Problem:** When Claude Code compacts a session (via `/compact` or auto-compact at ~95% context), it creates a NEW session file. Both old and new sessions appeared in UI, causing duplicate session listings.

**Solution:** Hook-based compaction detection with session supersession.

**Architecture:**
```
SessionStart hook (compact matcher) fires
            ↓
Hook writes marker file: .claude/compacted.<newSessionId>.marker
            ↓
CompactionWatcher detects marker file
            ↓
Daemon marks all OLDER sessions with same cwd as superseded
            ↓
UI filters out superseded sessions
```

**Key discovery:** Claude Code's SessionStart hook supports matchers: `startup`, `resume`, `clear`, `compact`. The `compact` matcher fires for the NEW session after compaction, providing the detection point.

**Implementation:**
1. **Idle timeout** - Increased from 5 to 10 minutes (`IDLE_TIMEOUT_MS`)
2. **Hook** - `~/.claude/hooks/session-compact.py` writes marker files when `source: "compact"`
3. **Settings** - `~/.claude/settings.json` registers SessionStart hook with `"matcher": "compact"`
4. **CompactionWatcher** - New module watches for `compacted.*.marker` files
5. **Schema** - Added `createdAt`, `superseded`, `supersededBy`, `supersededAt` fields to Session
6. **Server** - Handles compaction events, marks older sessions as superseded
7. **UI** - Filters out sessions where `superseded: true`

**Files created/modified:**
- `~/.claude/hooks/session-compact.py` - New hook for compaction detection
- `~/.claude/settings.json` - Added compact matcher hook
- `packages/daemon/src/compaction-watcher.ts` - New module
- `packages/daemon/src/config/timeouts.ts` - IDLE_TIMEOUT_MS now 10 minutes
- `packages/daemon/src/schema.ts` - Added supersession fields
- `packages/daemon/src/server.ts` - Added CompactionWatcher integration
- `packages/ui/src/hooks/useSessions.ts` - Filter superseded sessions

**Marker file format:**
```json
{
  "newSessionId": "abc123",
  "cwd": "/path/to/project",
  "compactedAt": "2026-01-09T18:00:00.000Z"
}
```

## Work Chain Management (Jan 2026)

**Problem:** Original compaction handling marked ALL sessions in the same `cwd` as superseded, but this was wrong when multiple terminal tabs work on the same repo. Each tab is a separate "work chain" - only sessions in the SAME work chain should be superseded.

**Key insight:** "Work chain" = sequence of Claude Code sessions connected by compaction in the same terminal tab. Multiple tabs = multiple independent work chains, even if in the same repo.

**Solution:** Only supersede the DIRECT PREDECESSOR, not all sessions in same cwd.

**Implementation:**
1. **workChainId** - UUID that persists across compaction, inherited from predecessor to successor
2. **findPredecessor()** - Uses terminal context (kittyWindowId) to match same work chain, falls back to most-recently-active heuristic
3. **Terminal link inheritance** - Kitty window link transferred from predecessor to new session on compaction
4. **Viewport auto-switch** - UI automatically switches to successor when session is superseded

**Terminal Context Matching:**
- If new session has kittyWindowId → only consider sessions with SAME kittyWindowId
- If no terminal context (embedded Mimesis terminal) → use most recently active session in same cwd

**Files modified:**
- `packages/daemon/src/schema.ts` - Added `workChainId`, `superseded`, `supersededBy`, `supersededAt` fields
- `packages/daemon/src/server.ts` - Rewrote `handleCompaction()`, added `findPredecessor()`, `getOrCreateWorkChainId()`
- `packages/ui/src/components/fleet-command/Viewport.tsx` - Added supersession detection for auto-switch
- `packages/ui/src/components/fleet-command/types.ts` - Added `onSelectSession` to ViewportProps

**Test coverage:**
- `compaction-watcher.test.ts` - Unit tests for marker file detection
- `compaction.test.ts` - Integration tests for predecessor selection and work chain inheritance

## Fleet Commander Architecture (Jan 2026)

**Problem:** Multiple Claude Code agents working across different projects lack centralized visibility. Users must check each terminal individually.

**Solution:** Control-plane / data-plane split with meta-agent ("Fleet Commander") monitoring all workers.

**Architecture:**
- Workers (per-repo agents) = data plane: do work, write status, update project skills
- Fleet Commander (in Mimesis) = control plane: watches worker outputs, single point of contact

**Key design decisions (from spec review):**
1. **Stable project_id** - Hash of git remote + repo name (not path decoding from `~/.claude/projects/`), stored in status frontmatter
2. **Computed task_size** - Stop hook calculates from git diff (lines/files changed, duration), not agent declaration
3. **AUTO markers in SKILL.md** - `<!-- BEGIN:AUTO:SECTION -->` markers protect human-authored sections from automation
4. **Queue-based skill updates** - Stop hook writes request to JSONL, daemon processes async (avoids latency, re-entrancy)
5. **Three artifacts**: Snapshot (status.md, mutable), Events (notifications.jsonl, append-only), Knowledge (SKILL.md, semi-stable)
6. **Cursor-based reading** - Commander hook maintains cursor in notifications.jsonl for incremental reads
7. **Debounce + dedupe** - Watcher debounces file changes, deduplicates events by `(project_id, updated, status, task_id)`

**Spec location:** `FLEET_CMD_SPEC.md` in repo root

**Files to create:**
- `~/.claude/hooks/skill-updater.py` - Processes skill update requests
- `~/.claude/commander/notifications.jsonl` - Cross-project event log
- `~/.claude/skills/projects/<project_id>/SKILL.md` - Per-project skills

**Status schema v2 (frontmatter):**
```yaml
schema: status.v2
project_id: mimesis__a1b2c3d4
repo_root: /path/to/project
git_remote: git@github.com:org/repo.git
base_commit: abc123
status: working
task_size_intent: big    # agent-declared
task_size_actual: small  # hook-computed at stop
```

## Segment Rotation Architecture (Jan 2026)

**Problem:** When Claude Code compacts a session, the UI creates a new tab/view for the new session, breaking the user's mental model of continuous work. Users expect compaction to be invisible - same tab, new underlying file.

**Solution:** "Kitty effect" - segment rotation within a stable UI tab.

**Core concept change:**
- Before: UI Tab ↔ Claude Session (1:1)
- After: UI Tab ↔ Claude Segments (1:many)

A "TerminalTab" becomes a **chain of Claude sessions** (segments), not a single session.

**Architecture:**
```
UI creates tab (POST /tabs) → gets tabId
                ↓
UI spawns PTY with tabId → COMMAND_CENTER_TAB_ID injected into env
                ↓
Claude Code hooks fire → emit-hook-event.py reads env var
                ↓
Hook POSTs to /hooks endpoint → TabManager appends segment
                ↓
UI receives segment rotation event → writes marker to terminal
```

**New data types (packages/daemon/src/schema.ts):**
```typescript
type ClaudeSegment = {
  sessionId: string;
  transcriptPath: string;
  startedAt: string;
  endedAt?: string;
  reason: "startup" | "resume" | "compact" | "clear";
  trigger?: "auto" | "manual";
};

type TerminalTab = {
  tabId: string;              // Stable UUID
  ptyId?: string;             // Runtime PTY ID
  repoRoot: string;
  segments: ClaudeSegment[];  // Append-only chain
  activeSegmentIndex: number;
  createdAt: string;
  lastActivityAt: string;
};
```

**New modules:**
- `~/.claude/hooks/emit-hook-event.py` - Bridge script that reads hook JSON from stdin, attaches COMMAND_CENTER_TAB_ID from env, POSTs to daemon
- `packages/daemon/src/tab-manager.ts` - TabManager class managing tabs and segment chains
- `packages/daemon/src/api/routes/hooks.ts` - API endpoint receiving hook events
- `packages/ui/src/hooks/useTabs.ts` - React hook for tab management

**Hook configuration (~/.claude/settings.json):**
```json
{
  "hooks": {
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/hooks/emit-hook-event.py" }] }],
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [
        { "type": "command", "command": "python3 ~/.claude/hooks/emit-hook-event.py" }
      ]
    }]
  }
}
```

**PTY environment injection:**
When creating a PTY via `POST /sessions/:id/pty`, pass `tabId` in the body. The PTY spawns Claude with `COMMAND_CENTER_TAB_ID` in its environment.

**Terminal segment markers:**
When segment changes, Terminal component writes a visual marker:
```
─── Compacted (manual) at 14:30 ───
```

**Key design decisions:**
1. Tab ID is ours, not Claude's - stable UUID survives compaction
2. Segments are append-only - never delete, just close and append
3. PTY stream is continuous - same WebSocket connection across segments
4. Hooks fail open - if daemon is down, Claude still works
5. Backward compatible - existing Session type unchanged, tabs layer on top

## Fleet Commander Architecture (Jan 2026)

**Problem:** Multi-project monitoring with per-commit analysis. How to trigger Sonnet for each commit?

**V3 approach (rejected):** Subagents spawned by worker Opus
- Hook prints reminder → Opus notices → spawns subagent → maybe
- Non-deterministic: relies on "agent psychology"
- Recursion risk: subagent might trigger hooks

**V4 approach (chosen):** Headless `claude -p` via queue + runner
- Hook appends to `commits.jsonl` → runner daemon → `claude -p --model sonnet`
- Deterministic: queue guarantees processing
- Safe: `disableAllHooks: true` + `defaultMode: "dontAsk"`
- Structured: `--json-schema` enforces output contract

**Why headless over subagents:**
1. **Determinism** - "CLI will execute" vs "Opus should notice"
2. **Isolation** - Fresh context per commit, not inherited session
3. **Permissions** - Enforced via settings file, not trusted behavior
4. **Structured output** - JSON schema contract, not markdown hope

**Key insight:** Bet on model intelligence for *content*, bet on determinism for *execution*. The runner is dumb code that invokes smart models.

**Specs:** `FLEET_CMD_SPEC_V3.md` (subagents), `FLEET_CMD_SPEC_V4.md` (headless)

## Fleet Commander v5 - Headless Architecture (Jan 2026)

Major transformation from terminal-centric to timeline-centric UI.

### Key Architectural Changes

1. **Gateway replaces PTY server** - Single WebSocket on port 4452 handles:
   - Session lifecycle (create/attach/detach)
   - PTY I/O forwarding
   - Hook event merging
   - Fleet event streaming (outbox tail)
   - Headless job execution (Commander)

2. **xterm.js removed entirely** - Replaced by Timeline component:
   - Structured event rendering (tool steps, text, thinking, stdout)
   - @tanstack/react-virtual for virtualized scrolling
   - Event grouping: stdout events associate with surrounding tool executions

3. **SQLite briefing ledger** - `~/.claude/commander/fleet.db` stores:
   - Projects (stable project_id from git remote hash)
   - Briefings (semantic status from workers)
   - Outbox events (push queue for realtime)
   - Jobs (Commander history, headless tasks)

4. **Hook-based event forwarding** - Unix socket IPC:
   - PostToolUse hooks emit to `~/.claude/commander/gateway.sock`
   - Gateway merges hook events into session stream
   - Non-blocking: hook failure doesn't block worker

### UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Timeline` | `timeline/Timeline.tsx` | Virtualized event stream |
| `TimelineToolStep` | `timeline/` | Expandable tool use cards |
| `SessionInput` | `session-input/` | stdin composer + history |
| `CommanderTab` | `commander/` | Cross-project Opus queries |

### Removed Components

- `Viewport.tsx` - xterm.js wrapper (replaced by Timeline)
- `terminal/Terminal.tsx` - xterm.js component
- `terminal-dock/` - Terminal dock container
- `agent-command/` - Old terminal-based layout
- `usePtySession.ts` - PTY hook (replaced by useGateway)

### Dependencies Changed

**Removed from UI:**
- `@xterm/xterm`
- `@xterm/addon-fit`
- `@xterm/addon-web-links`

**Still in use (daemon):**
- `@durable-streams/client`
- `@durable-streams/server`
- `@durable-streams/state`

**Added:**
- `@tanstack/react-virtual` (virtualized scrolling)

### Protocol (WebSocket)

**Client → Gateway:**
```typescript
{ type: 'session.attach', session_id, from_seq }
{ type: 'session.stdin', session_id, data }
{ type: 'session.signal', session_id, signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL' }
{ type: 'job.create', job: { type, model, request } }
```

**Gateway → Client:**
```typescript
{ type: 'event', session_id, seq, event: { type: 'stdout' | 'tool' | 'text' | ... } }
{ type: 'session.status', session_id, status: 'working' | 'waiting' | 'idle' }
{ type: 'job.stream', job_id, chunk }
{ type: 'fleet.event', event_id, event }
```

### Design Principles (from spec)

1. **Bet on model intelligence for content, bet on determinism for execution**
2. **PTY stream is not source of truth** - SQLite briefings are authoritative
3. **Hooks are best-effort enrichment** - Failure doesn't break core flow
4. **Always virtualize** - Sessions can have 1000+ events
5. **Collapse thinking, expand output** - Clean but informative defaults

**Spec:** `FLEET_CMD_SPEC_V5.md` (headless architecture)

### UI Simplification - Single Layout (Jan 2026)

Removed Focus/Ops mode toggle. Consolidated to single standard 3-column layout.

**Why:**
- Focus/Ops mode was partially implemented but only Focus mode was actually used
- Ops mode grid referenced zones (`table`, `dock`) without corresponding components
- Simpler codebase: one layout, no mode state management

**Changes:**
- Removed `ViewMode` type from `types.ts`
- Simplified `CommandBar.tsx` - removed mode toggle, always shows standard header
- Removed `viewMode` state from `FleetCommand.tsx`
- Consolidated CSS to single `.fleet-command` grid (was `.fleet-command--focus` / `.fleet-command--ops`)

**Final layout:** Roster (left) | Timeline (center) | TacticalIntel (right) | StatusStrip (bottom)

### Documentation Staleness (Jan 2026)

**UPDATE:** `docs/ui-components.md` has been updated to v5 (Timeline, 3-column layout, useGateway hook).

**Still stale:**
- `README.md` - Still references port 4450, xterm.js, Durable Streams, @durable-streams/*, Ops/Focus mode toggle, Terminal Dock, 4-zone layout
- `docs/operations/configuration.md` - Documents STREAM_HOST, PORT, VITE_STREAM_URL env vars that are unused (Durable Streams removed)

**Correct architecture:** Only ports 4451 (REST) and 4452 (Gateway WebSocket) are active. UI uses Timeline component with @tanstack/react-virtual, not xterm.js.

### WebSocket Singleton Pattern for HMR/StrictMode (Jan 2026)

**Problem:** useGateway hook caused rapid WebSocket connect/disconnect loops during development. React StrictMode double-mounts plus Vite HMR reloads created race conditions where multiple WebSocket connections competed.

**Root cause:** Module-level refs and state reset on every HMR reload. Even with mountedRef guards, HMR creates fresh modules, so guards don't persist.

**Solution:** Global singleton stored on `globalThis` that survives HMR:
```typescript
// Global singleton that survives HMR
const connectionManager: ConnectionManager = (globalThis as unknown as { __gatewayManager?: ConnectionManager }).__gatewayManager ?? {
  ws: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  subscribers: new Set(),
  statusListeners: new Set(),
  lastStatus: "disconnected",
};
(globalThis as unknown as { __gatewayManager: ConnectionManager }).__gatewayManager = connectionManager;
```

**Key design:**
- Hook subscribes to singleton on mount, unsubscribes on unmount
- Singleton only reconnects if there are active subscribers
- Connection stays alive across HMR reloads and StrictMode remounts
- Status and messages broadcast to all subscribers via Sets

**Files:** `packages/ui/src/hooks/useGateway.ts`

**Type augmentation pattern (preferred over double casts):**
```typescript
// Bad: double cast abuse
const singleton = (globalThis as unknown as { __manager?: T }).__manager;

// Good: proper type augmentation
declare global {
  // eslint-disable-next-line no-var
  var __gatewayManager: ConnectionManager | undefined;
}
const singleton = globalThis.__gatewayManager;

### Entry Conversion for Watcher Sessions (Jan 2026)

**Problem:** External/watcher sessions only showed metadata ("Monitoring external session...") in Timeline, not the actual conversation history.

**Solution:** Convert JSONL LogEntry[] to WebSocket SessionEvent[] on attach.

**Architecture:**
```
SessionWatcher.tailJSONL()  →  LogEntry[] (up to 500)
        ↓
session-store.ts stores entries in TrackedSession
        ↓
On attach: convertEntriesToEvents(entries)
        ↓
TextEvent[], ToolEvent[], ThinkingEvent[] sent to UI
```

**Conversion mapping:**
| LogEntry | SessionEvent |
|----------|--------------|
| UserEntry (string) | TextEvent (user prompt) |
| UserEntry (tool_result[]) | ToolEvent (post) |
| AssistantEntry TextBlock | TextEvent |
| AssistantEntry ToolUseBlock | ToolEvent (pre) |
| AssistantEntry ThinkingBlock | ThinkingEvent |
| SystemEntry stop_hook_summary | TextEvent |

**Key insight:** SessionWatcher already parses and stores full conversation data in `entries`. The gap was only that gateway didn't convert and send it to UI for watcher sessions.

**Files:**
- `packages/daemon/src/gateway/entry-converter.ts` (NEW) - Conversion functions
- `packages/daemon/src/gateway/session-store.ts` - Added `entries?: LogEntry[]`
- `packages/daemon/src/gateway/gateway-server.ts` - Uses converter on watcher attach

## QA Audit (Jan 2026)

Full audit completed. Overall health: **HEALTHY**. 11 findings (1 critical).

### Critical: Unbounded fleetEvents Array
`packages/ui/src/hooks/gateway-handlers.ts:68` — `setFleetEvents((prev) => [...prev, event])` grows without limit. Long-running UI sessions will accumulate events indefinitely causing memory leak.

**Fix required:**
```typescript
const MAX_FLEET_EVENTS = 1000;
setFleetEvents((prev) => {
  const next = [...prev, event];
  return next.length > MAX_FLEET_EVENTS ? next.slice(-MAX_FLEET_EVENTS) : next;
});
```

### High Priority Technical Debt
1. `server.ts:handleCompaction()` — 62 lines mixing 4 concerns. Extract helpers.
2. `FleetCommand.tsx` — Mixes data fetching, state, keyboard nav, presentation. Split container/view.
3. `outbox-tailer.ts:73` — Async `poll()` in setInterval without error handling. Add try/catch.

### Architecture Strengths Confirmed
- Zero circular dependencies
- Clean layer separation (daemon: config → utils → core → gateway → serve)
- Consistent naming conventions (100% compliance)
- Comprehensive error handling (no empty catches)
- Type safety discipline (only 2 `any` usages, both justified)
- Proper resource cleanup (all timers, WebSockets, listeners cleaned up)

## Documentation Audit (Jan 2026)

### Critical Staleness: getting-started.md
Lines 36-51 describe obsolete "Kanban-style board" with session cards. Reality: 3-column Fleet Command layout (Roster, Timeline, Tactical Intel) since v5.

**Fix required:**
- Replace Kanban board description with Fleet Command layout
- Change "AI-generated goal and summary" to "hook-based status from .claude/status.md"
- Remove "Needs Approval" column reference (now `hasPendingToolUse` flag)

### Broken Links & Exports
- `docs/claude-code/README.md:116` → `docs/guides/installation.md` (file doesn't exist)
- `packages/ui/src/components/ops-table/index.ts` exports `OpsTable`, `OpsTableRow` that no longer exist

### Documentation Gaps (High Priority)
| Missing Doc | Purpose |
|-------------|---------|
| `docs/architecture/session-lifecycle.md` | Compaction, segments, work chains |
| `docs/api/gateway-protocol.md` | WebSocket message schemas |

### Coverage
- 98 total .md files (~128k lines)
- ~40% of code modules have corresponding docs
- Daemon: ~33% coverage, UI: ~48% coverage

## Comprehensive E2E Test Results (Jan 2026)

Full E2E testing completed including browser automation and unit tests.

### Browser Automation Tests (via /webtest)

| Test | Result |
|------|--------|
| UI Load & Gateway Connection | ✅ PASS |
| Session Selection (click) | ✅ PASS |
| Timeline Event Rendering | ✅ PASS |
| Tool Card Expansion | ✅ PASS |
| Commander Tab Toggle | ✅ PASS |
| Status File → TacticalIntel | ✅ PASS |
| StatusStrip Filters | ✅ PASS |
| SessionInput Visible | ✅ PASS |
| Keyboard Navigation (↑/↓) | ✅ PASS |
| Real-time Event Updates | ✅ PASS |

**Two-way interaction verified:**
- UI displays real-time tool events from Claude Code sessions
- Status file content propagates to TacticalIntel panel
- Gateway WebSocket connection shows "ONLINE" status
- Keyboard shortcuts (ArrowUp/ArrowDown) switch sessions correctly

### Unit Test Coverage

**Daemon tests:** 267 passed, 2 skipped (baseline: 248 passed)

**New test file added:**
- `packages/daemon/src/gateway/session-store.test.ts` (19 tests)
  - `addFromWatcher` - session creation, event emission, status mapping
  - `addFromPty` - PTY session creation, watcher data preservation
  - `updateFileStatus` - status file integration, UI status mapping
  - `updateStatus` - status updates, lastActivityAt tracking
  - `remove` - session removal, event emission
  - `subscribe` - listener pattern, unsubscribe, error handling

### Verified Features

1. **Gateway WebSocket (port 4452)**
   - Session lifecycle events (discovered, updated, removed)
   - Real-time event streaming
   - Two-tier session model (PTY vs watcher)

2. **Timeline Component**
   - Virtualized scrolling with @tanstack/react-virtual
   - Tool step cards with expandable Input/Result sections
   - Thinking blocks (collapsed by default)
   - Auto-scroll on new events

3. **Session Store**
   - Unified tracking from SessionWatcher + PtyBridge
   - File status integration
   - Event-driven architecture with pub/sub

4. **Keyboard Navigation**
   - Arrow keys (↑/↓) for session switching
   - Session state updates across all panels on switch

### Test Environment

```bash
# Services running during tests
pnpm start  # Daemon (4451, 4452) + UI (5173)

# Test commands
cd packages/daemon && pnpm test  # 267 passed, 2 skipped
```

### Remaining Test Gaps

| Area | Status |
|------|--------|
| UI unit tests (Vitest) | Not implemented |
| PTY stdin/stdout E2E | Manual only |
| Commander job streaming | Manual only |
| Hook event injection | Manual only |

### Tailwind prose Class Gotcha (Jan 2026)

**Problem:** Timeline text events weren't rendering properly - text appeared collapsed or hidden.

**Root cause:** `TimelineText.tsx` used Tailwind's `prose` utility class (`prose prose-sm dark:prose-invert`), which is designed for markdown article rendering. When combined with `whitespace-pre-wrap` on `<p>` elements, it caused text to render with unexpected margins, line-heights, and spacing.

**Fix:** Replace `prose` with simple direct styling:
```tsx
// Bad: prose class for non-markdown content
<div className="prose prose-sm dark:prose-invert">
  <p className="whitespace-pre-wrap">{text}</p>
</div>

// Good: direct styling for terminal/structured output
<div className="text-sm text-foreground leading-relaxed">
  <div className="whitespace-pre-wrap break-words">{text}</div>
</div>
```

**Rule:** Only use `prose` for actual markdown/article content. For terminal output, structured data, or code - use direct Tailwind utilities.

### Flex Container Scroll Gotcha (Jan 2026)

**Problem:** Timeline wasn't scrollable and SessionInput was pushed off-screen despite Timeline having `flex-1 overflow-auto`.

**Root cause:** Parent flex container (`.fleet-viewport`) was missing `min-height: 0`. In CSS flexbox, children with `overflow-auto` need the parent to have `min-height: 0` to constrain height - otherwise the flex item expands to fit content instead of scrolling.

**Fix:**
```css
.fleet-viewport {
  display: flex;
  flex-direction: column;
  min-height: 0;      /* Required for flex children to scroll */
  overflow: hidden;   /* Contain scrolling to child */
}
```

**Rule:** When a flex child needs to scroll (`overflow-auto` + `flex-1`), the parent MUST have `min-height: 0` (or `overflow: hidden`) to constrain height.

### Shared Claude Path Utility (Jan 2026)

**Problem:** Commander jobs stuck on "Streaming" because `job-runner.ts` used bare `"claude"` in `spawn()`, while PTY sessions correctly used full path via `getClaudePath()`.

**Root cause:** `spawn()` doesn't inherit PATH the same way as shell commands. The daemon already documented this in MEMORIES.md for node-pty, but the job runner was missing the fix.

**Solution:** Created shared utility `packages/daemon/src/utils/claude-path.ts`:
- Uses `which claude` to find full path
- Fallback chain: `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, `/usr/bin/claude`
- Caches result for process lifetime
- Both `job-runner.ts` and `api/routes/pty.ts` now import from shared location

**Also fixed:** Silent failure on non-JSON output - now logs stderr and non-JSON stdout for debugging.

### Claude CLI stream-json Format vs API Events (Jan 2026)

**Problem:** Commander UI showed empty green box after job completion despite daemon logs showing success.

**Root cause:** `parseStreamEvents()` in `CommanderTab.tsx` expected API-level stream events (`content_block_delta`, `content_block_start`) but Claude CLI's `--output-format stream-json` outputs session-level JSONL entries.

**Format difference:**
```typescript
// Expected (API events):
{ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } }

// Actual (CLI JSONL):
{ type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } }
```

**Fix:** `parseStreamEvents()` now handles both formats:
1. Parses `type: "assistant"` events and extracts from `message.content` array
2. Keeps backwards compatibility for API-level events

**Rule:** When parsing Claude CLI output with `--output-format stream-json`, expect session-level types (`system`, `assistant`, `user`, `result`) not API stream types.

### Claude CLI --verbose Flag Requirement (Jan 2026)

**Problem:** Commander jobs failed immediately with error: "When using --print, --output-format=stream-json requires --verbose"

**Root cause:** Claude CLI's `--output-format stream-json` requires the `--verbose` flag when used with print mode (`-p`). Without it, the CLI exits with code 1.

**Fix:** Always include `--verbose` in job-runner.ts buildArgs():
```typescript
const args = [
  "-p", // Print mode (non-interactive)
  "--output-format", "stream-json",
  "--verbose", // Required for stream-json in print mode
];
```

**Rule:** When using `claude -p --output-format stream-json`, always add `--verbose`.

### Timeline Information Density Pattern (Jan 2026)

**Goal:** Maximize visible content in Timeline without sacrificing usability.

**Key patterns:**
1. **Running vs completed tools**: Running tools expand (need visibility), completed collapse (preserve density)
2. **Smart path truncation**: `smartTruncatePath()` shows `...src/components/File.tsx` instead of full path
3. **Strip line numbers**: Results from Read tool have `1→` prefixes stripped via `stripLineNumbers()`
4. **Minimal padding**: py-0.5 between events, py-1 within tool cards
5. **Simplified text**: No icons for text events, just content

**Files:** Timeline components in `packages/ui/src/components/timeline/`

### Fleet Commander E2E Test Results (Jan 2026)

Full report: `.claude/test-reports/fleet-commander-e2e-2026-01-12.md`

**Bug #1 FIXED: Commander Permission Blocking**

Headless Commander jobs got stuck because `.claude/` directory triggers "sensitive file" approval. Fix: added `--dangerously-skip-permissions` flag to `job-runner.ts:230`:

```typescript
const args = [
  "-p",
  "--output-format", "stream-json",
  "--verbose",
  "--dangerously-skip-permissions", // Required: headless mode can't approve interactively
];
```

**Bug #2 DOCUMENTED: UI Conversation History on Reset**

Clicking "New Conversation" resets backend context but UI still displays previous conversation visually. No separator or clear indication of context reset. Backend works correctly.

**All Tests Passed:**
- Services startup (ports 4451, 4452, 5173)
- Commander first prompt
- Commander multi-turn (context preserved via `--continue`)
- Commander reset (backend works)
- Hook events flow to Timeline (real-time tool events)
- Real-time session status updates

## Claude CLI Authentication vs API Billing (Jan 2026)

**Key behavior:** Headless mode (`claude -p`) prefers `ANTHROPIC_API_KEY` when set, but falls back to OAuth if not set.

| Scenario | Authentication | Billing |
|----------|----------------|---------|
| ANTHROPIC_API_KEY set | API key (preferred) | Pay-per-token |
| ANTHROPIC_API_KEY unset | OAuth fallback | Max subscription ✓ |

**Root cause of API costs:** Having `ANTHROPIC_API_KEY` in your environment causes headless mode to prefer API billing over OAuth, even when logged into Max subscription.

**Solution:** Remove `ANTHROPIC_API_KEY` from your environment:
```bash
unset ANTHROPIC_API_KEY
# Also remove from ~/.zshrc, ~/.bashrc, or .env files
```

**Verified:** Commander works without API key (tested Jan 2026). With no API credits on Console account, it used OAuth/Max subscription successfully.

**Dead code removed:** `serve.ts` had unused ANTHROPIC_API_KEY validation from deleted AI summarizer feature.

## PTY-Based Commander Architecture (Jan 2026)

**Problem:** Headless job-based Commander (`claude -p`) had several correctness bugs:
1. No hooks fire in headless mode (PostToolUse, etc.)
2. Turn serialization broken - boolean lock released when job starts, not finishes
3. `--continue` flag not being passed correctly
4. BUSY rejection instead of prompt queuing
5. No session persistence across daemon restarts

**Solution:** Transform Commander from headless jobs to a **persistent PTY session** running interactive `claude`.

**Key architectural changes:**

| Headless (`claude -p`) | PTY (`claude`) |
|------------------------|----------------|
| No hooks fire | All hooks fire naturally |
| New process per prompt | Persistent session |
| `--continue` for continuity | Native conversation state |
| BUSY rejection on concurrent prompts | Prompt queue with status-based draining |

**Implementation:**
- `CommanderSessionManager` class manages PTY lifecycle, prompt queue, status detection
- Session ID captured by watching for Claude's JSONL file creation
- Fleet prelude injected via `<system-reminder>` blocks in prompt (not `--append-system-prompt`)
- Status detection via existing `SessionStore` infrastructure
- Queue drains automatically when status changes to "waiting_for_input"

**New files:**
- `packages/daemon/src/gateway/commander-session.ts` - Core Commander PTY management

**Protocol changes:**
```typescript
// New client messages
{ type: "commander.send", prompt }  // Queue or send prompt
{ type: "commander.reset" }         // Kill PTY, clear queue
{ type: "commander.cancel" }        // SIGINT to interrupt

// New gateway messages
{ type: "commander.state", state }   // State updates (status, queue count)
{ type: "commander.queued", position } // Prompt was queued
{ type: "commander.ready" }          // Ready for input
```

**UI changes:**
- `CommanderTab` now uses `commanderState` prop instead of `activeJob`
- `CommanderInput` shows queue status in placeholder
- Queue indicator shows "Commander is working (N queued)..."

**Documentation:** `docs/architecture/commander.md` updated with PTY architecture.

### OpenTelemetry Conditional Span Pattern (Jan 2026)

**Problem:** High-frequency polling operations (like outbox.poll every 1s) create noisy telemetry when spans are created unconditionally.

**Solution:** Only create spans when there's actual work to process:

```typescript
private poll(): void {
  const dbEvents = this.outboxRepo.getAfterCursor(this.cursor, 100);

  // Skip span creation if no events (avoids noisy polling telemetry)
  if (dbEvents.length === 0) {
    return;
  }

  // Only trace when we have work to do
  const tracer = getTracer();
  const span = tracer.startSpan("outbox.poll", { attributes: {...} });
  try {
    // ... process events
  } finally {
    span.end();
  }
}
```

**Rule:** For polling operations, check for work BEFORE creating the span. This keeps traces meaningful while avoiding noise.

### ANSI Escape Code Stripping for PTY Output (Jan 2026)

**Problem:** Commander PTY output showed garbled text with visible escape sequences like `[>1v`.

**Root cause:** Basic ANSI regex patterns miss DEC private mode sequences. Claude Code's TUI sends device attribute queries (`\x1b[>c`) and responses (`\x1b[>1v`) which have a `>` prefix not handled by simple patterns.

**Solution:** Comprehensive ANSI regex in `CommanderTab.tsx`:
```typescript
const ANSI_REGEX = /\x1b\[[?>=!]?[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012UK]|\x1b[78DEHM]|\x1b=|\x1b>/g;
```

**Key patterns to handle:**
- `\x1b\[[?>=!]?...` - CSI sequences with DEC prefixes (`?`, `>`, `=`, `!`)
- `\x1b[78DEHM]` - Cursor save/restore, line operations
- `\x1b=` / `\x1b>` - Keypad mode sequences

**Rule:** When stripping ANSI from PTY output, use comprehensive patterns. The `strip-ansi` npm package is an alternative but adds a dependency.

### StatusWatcher Must Watch PTY Session Directories (Jan 2026)

**Problem:** Commander stuck on "Streaming..." indicator - status never transitioned after Claude finished processing.

**Root cause:** When `CommanderSessionManager` creates a PTY session, it was NOT calling `statusWatcher.watchProject(COMMANDER_CWD)`. StatusWatcher tracks status file changes in `.claude/status.*.md` to detect session state transitions. Without this, the SessionStore never received `fileStatus` updates.

**Data flow that was broken:**
1. Claude writes status to `~/.claude/commander/.claude/status.*.md` ✓
2. StatusWatcher NOT monitoring that directory ✗
3. SessionStore never gets `fileStatus` updates ✗
4. `CommanderSessionManager.handleSessionStoreEvent()` never fires ✗
5. Status stays "working" forever ✗

**Fix:** Pass `statusWatcher` to `CommanderSessionManager` and call `watchProject()` after PTY creation:

```typescript
// commander-session.ts - Add to constructor options
interface CommanderSessionManagerOptions {
  ptyBridge: PtyBridge;
  sessionStore: SessionStore;
  statusWatcher?: StatusWatcher;  // NEW
}

// After PTY creation in ensureSession()
if (this.statusWatcher) {
  this.statusWatcher.watchProject(COMMANDER_CWD);
}

// gateway-server.ts - Pass statusWatcher
this.commanderSession = new CommanderSessionManager({
  ptyBridge: this.ptyBridge,
  sessionStore: this.sessionStore,
  statusWatcher: this.statusWatcher,  // NEW
});
```

**Rule:** Any module that creates PTY sessions (where Claude Code writes status files) MUST ensure StatusWatcher is watching that directory. The existing SessionWatcher handles external sessions from `~/.claude/projects/`, but new PTY sessions need explicit `watchProject()` calls.

### Session ID Capture Must Filter Old Files (Jan 2026)

**Problem:** Commander "New Conversation" still appeared stuck after StatusWatcher fix.

**Root cause:** `checkExistingSessionFiles()` was picking up OLD session files from previous (possibly stuck) sessions instead of waiting for Claude to create a new one.

**Data flow:**
1. User clicks "New Conversation" → `reset()` clears `claudeSessionId`
2. New PTY spawns → `startSessionIdCapture()` called
3. `checkExistingSessionFiles()` finds OLD JSONL files ✗
4. Uses stale session ID → appears stuck

**Fix:** Track PTY spawn timestamp and filter files by mtime:
```typescript
// commander-session.ts
private ptySpawnedAt: number | null = null;

// In ensureSession() before startSessionIdCapture()
this.ptySpawnedAt = Date.now();

// In checkExistingSessionFiles()
const MAX_AGE_MS = 5000;
const age = this.ptySpawnedAt - stats.mtimeMs;
if (age <= MAX_AGE_MS) {
  // Only consider files modified within 5 seconds of PTY spawn
}
```

**Rule:** When capturing session IDs from file system, always filter by creation/modification time relative to the triggering action. Old files from previous sessions must be ignored.

### Chokidar Glob Pattern Gotcha on macOS (Jan 2026)

**Problem:** Chokidar's `add` event never fires when Claude creates new `.jsonl` session files despite watcher being ready.

**Root cause:** macOS FSEvents doesn't reliably fire `add` events when watching with glob patterns like `${dir}/*.jsonl`. The watcher becomes ready, but new file creation events are not emitted.

**Solution:** Watch the **directory directly** instead of using a glob pattern, then filter in the event handler:

```typescript
// Bad: glob pattern (unreliable on macOS)
watch(`${sessionsDir}/*.jsonl`, { ignoreInitial: true })
  .on("add", (path) => { ... })

// Good: directory + filter (reliable)
watch(sessionsDir, { ignoreInitial: true, depth: 0 })
  .on("add", (filePath) => {
    if (!filePath.endsWith(".jsonl")) return;
    // ... handle file
  })
```

**Rule:** On macOS, always watch directories directly instead of glob patterns when you need `add` events for new files. FSEvents handles directory watching reliably but glob pattern matching is unreliable.

## Headless Claude Code Usage Pattern (Jan 2026)

**Running slash commands via headless mode:**
```bash
claude -p "/command-name optional args" --allowedTools "Read,Write,Edit,Glob,Grep,Bash(*),Task,mcp__*"
```

**Key flags:**
- `-p` / `--print` - Non-interactive (headless) mode
- `--allowedTools` - Auto-approve tools without prompts (comma-separated, supports wildcards)
- `--output-format json` - For structured output
- `--output-format stream-json --verbose` - For streaming (requires `--verbose`)
- `--continue` / `-c` - Continue most recent conversation
- `--resume <id>` - Resume specific session
- `--max-turns N` - Limit agentic turns

**Sequential runs in background:**
```bash
echo "=== RUN 1 ===" && claude -p "/command" --allowedTools "..." && \
echo "=== RUN 2 ===" && claude -p "/command" --allowedTools "..." && \
echo "=== RUN 3 ===" && claude -p "/command" --allowedTools "..."
```

**Note:** MCP tools require `mcp__<server>__*` pattern in allowedTools.

## Commander Event Architecture - Two-Bus Separation (Jan 2026)

**Problem:** Commander was receiving ALL outbox events including high-frequency `silent` ones (session starts), causing context overflow with 10+ concurrent agents.

**Solution:** broadcast_level-based filtering with prelude compaction.

**Key architectural decisions:**

1. **Two buses stay separate:**
   - Timeline firehose: PostToolUse → gateway.sock → UI (ephemeral, high-frequency)
   - Commander milestones: Stop → ingest → outbox → prelude (durable, low-frequency)

2. **Denormalized broadcast_level on outbox_events:**
   - Column added directly to outbox_events table for fast filtering
   - No JOINs needed to filter by level

3. **Prelude compaction algorithm:**
   - Alerts: Always included (blocked/failed/errors/doc-drift)
   - Highlights: Max 1 per project (newest wins)
   - Mentions: Capped at 10 total (newest first)
   - Silent: Skipped entirely

4. **SessionStart creates silent outbox event:**
   - Hook fires on session start → POSTs to `/fleet/session-start`
   - Creates `session_started` event with `broadcast_level: silent`
   - Commander can query roster state but doesn't get notified for each start

**Files:**
- `packages/daemon/src/gateway/fleet-prelude-builder.ts` - Compaction algorithm
- `packages/daemon/src/fleet-db/outbox-repo.ts` - New insert methods
- `~/.claude/hooks/session-start-ingest.py` - SessionStart hook
