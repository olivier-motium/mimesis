# Daemon Internal APIs

Reference documentation for the daemon's internal service modules.

## Git Operations (`git.ts`)

Detects git repository info for sessions without shell commands.

### Public Functions

#### `getGitInfo(cwd: string): Promise<GitInfo>`

Reads git repository information directly from `.git` directory.

```typescript
import { getGitInfo } from "./git.js";

const info = await getGitInfo("/path/to/project");
if (info.isGitRepo) {
  console.log(`Repo: ${info.repoId}, Branch: ${info.branch}`);
}
```

#### `getGitInfoCached(cwd: string): Promise<GitInfo>`

Returns cached git info for a directory. Avoids repeated filesystem lookups.

```typescript
import { getGitInfoCached } from "./git.js";

// First call reads from filesystem
const info1 = await getGitInfoCached("/path/to/project");

// Subsequent calls return cached result
const info2 = await getGitInfoCached("/path/to/project");
```

### GitInfo Schema

```typescript
interface GitInfo {
  repoUrl: string | null;   // Full URL: https://github.com/owner/repo
  repoId: string | null;    // Normalized: owner/repo
  branch: string | null;    // Current branch name (null if detached HEAD)
  isGitRepo: boolean;       // Whether directory is in a git repo
}
```

### URL Parsing

Handles both HTTPS and SSH remote URL formats:

| Format | Example |
|--------|---------|
| HTTPS | `https://github.com/owner/repo.git` |
| SSH | `git@github.com:owner/repo.git` |

Both are normalized to `owner/repo` for `repoId`.

### Implementation Details

- Walks up directory tree to find `.git` folder
- Reads `.git/HEAD` for current branch
- Parses `.git/config` for origin remote URL
- No shell commands - pure filesystem operations
- Cache is per-directory, persists for daemon lifetime


---

## Utility Modules (`utils/`)

Shared utilities used across the daemon.

### `timeout.ts`

Provides timeout wrapping for async operations.

```typescript
import { withTimeout, TimeoutError } from "./utils/timeout.js";

// Wrap a promise with a timeout
const result = await withTimeout(
  someAsyncOperation(),
  15000, // 15 seconds
  "Operation description"
);

// Handle timeout errors
try {
  await withTimeout(promise, 5000);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.warn(`Timed out after ${error.timeoutMs}ms`);
  }
}
```

### `colors.ts`

ANSI color codes for terminal output.

```typescript
import { colors } from "./utils/colors.js";

console.log(`${colors.green}Success${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}Title${colors.reset}`);
```

Available colors: `reset`, `dim`, `bold`, `green`, `yellow`, `blue`, `cyan`, `magenta`, `red`, `gray`.

### `errors.ts`

Standardized error handling utilities.

```typescript
import { getErrorMessage, logError, logWarn } from "./utils/errors.js";

// Extract message from unknown error
const msg = getErrorMessage(error);

// Log with consistent formatting
logError("github", error, "checking PR");
logWarn("parser", "Skipped malformed entry");
```

### `type-guards.ts`

Type guards for safer type narrowing, replacing `as X` assertions.

```typescript
import {
  isUserEntry,
  isAssistantEntry,
  isSystemEntry,
  isError,
  isRecord,
  getErrorMessage,
} from "./utils/type-guards.js";

// Type-safe entry handling
if (isUserEntry(entry)) {
  console.log(entry.message.content); // TypeScript knows it's UserEntry
}

// Safe error extraction
try {
  await someOperation();
} catch (error) {
  console.error("Failed:", getErrorMessage(error));
}
```

---

## Kitty Terminal Control (`kitty-rc.ts`)

Remote control wrapper for kitty terminal using `kitten @` commands.

### Public Functions

#### `health(): Promise<boolean>`

Check if kitty is reachable via the socket.

```typescript
import { KittyRc } from "./kitty-rc.js";

const kitty = new KittyRc();
const available = await kitty.health();
```

#### `focusWindow(windowId: number): Promise<boolean>`

Focus a kitty window by ID. Returns true if successful.

#### `launchTab(opts: LaunchOptions): Promise<number>`

Launch a new kitty tab with options. Returns the window ID.

```typescript
const windowId = await kitty.launchTab({
  cwd: "/path/to/project",
  tabTitle: "Session Tab",
  vars: { cc_session_id: "abc123" },
  command: ["claude", "--resume", "abc123"],
});
```

The `command` option allows running a command in the new tab (e.g., resuming a Claude Code session).

#### `sendText(windowId: number, text: string, submit: boolean): Promise<void>`

Send text to a window. If submit is true, appends carriage return.

#### `selectWindow(): Promise<number | null>`

Open interactive window picker. Returns null if cancelled.

### Automatic Configuration

Kitty remote control is **automatically configured** when the daemon starts. No manual setup required.

The daemon:
1. Checks if kitty is installed
2. Creates `~/.config/kitty/claude-code.conf` with remote control settings
3. Adds `include claude-code.conf` to your `kitty.conf`
4. Creates `macos-launch-services-cmdline` for GUI launches (macOS only)
5. Sends SIGUSR1 to reload running kitty instances

For manual setup: `pnpm --filter @mimesis/daemon setup:kitty`

### Generated Config Files

**~/.config/kitty/claude-code.conf:**
```conf
allow_remote_control socket-only
listen_on unix:/tmp/claude-cc-kitty
```

Uses `socket-only` mode for security (no passwords needed).

---

## Kitty Auto-Setup (`kitty-setup.ts`)

Automatic kitty terminal configuration module.

### Public Functions

#### `setupKitty(): Promise<KittySetupResult>`

Run full setup process. Creates config files and reloads kitty.

```typescript
import { setupKitty } from "./kitty-setup.js";

const result = await setupKitty();
// { success: true, status: "ready", message: "...", actions: [...] }
```

#### `getKittyStatus(): Promise<KittyStatusDetails>`

Get detailed status for diagnostics.

```typescript
import { getKittyStatus } from "./kitty-setup.js";

const status = await getKittyStatus();
// { installed, running, socketExists, socketReachable, configExists }
```

### KittyStatus Types

```typescript
type KittyStatus =
  | "not_installed"      // kitty not found
  | "not_running"        // kitty installed but not running
  | "not_configured"     // needs setup
  | "config_needs_reload" // config created, restart kitty
  | "ready"              // fully working
  | "setup_failed";      // setup error
```

---

## Terminal Link API (`api/router.ts`)

HTTP API for terminal control (Port 4451).

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/kitty/health` | Check kitty availability with detailed status |
| POST | `/api/kitty/setup` | Trigger manual kitty setup |
| POST | `/api/sessions/:id/focus` | Focus linked terminal |
| POST | `/api/sessions/:id/open` | Open/create terminal |
| POST | `/api/sessions/:id/link-terminal` | Link existing terminal |
| DELETE | `/api/sessions/:id/link-terminal` | Unlink terminal |
| POST | `/api/sessions/:id/send-text` | Send text to terminal |
| DELETE | `/api/sessions/:id` | Delete session permanently (removes JSONL file) |

### Request/Response Examples

**Check kitty health:**
```bash
curl http://127.0.0.1:4451/api/kitty/health
# {
#   "available": true,
#   "details": {
#     "installed": true,
#     "running": true,
#     "socketExists": true,
#     "socketReachable": true,
#     "configExists": true
#   }
# }
```

**Trigger kitty setup:**
```bash
curl -X POST http://127.0.0.1:4451/api/kitty/setup
# {
#   "success": true,
#   "status": "ready",
#   "message": "Kitty remote control configured successfully",
#   "actions": ["Created ~/.config/kitty/claude-code.conf", ...]
# }
```

**Open session terminal:**

Opens a new kitty tab and resumes the Claude Code session using `claude --resume <sessionId> --dangerously-skip-permissions`.

```bash
curl -X POST http://127.0.0.1:4451/api/sessions/abc123/open
# { "success": true, "windowId": 42, "created": true }
```

**Send text:**
```bash
curl -X POST http://127.0.0.1:4451/api/sessions/abc123/send-text \
  -H "Content-Type: application/json" \
  -d '{"text": "npm test", "submit": true}'
```

**Delete session permanently:**

Removes the session JSONL file from disk and removes from the stream. This action cannot be undone.

```bash
curl -X DELETE http://127.0.0.1:4451/api/sessions/abc123
# { "success": true }
```

---

## Hook Events API (`api/routes/hooks.ts`)

Receives events from Claude Code hooks via the `emit-hook-event.py` bridge script. Used for segment chain management.

### POST /api/hooks

Receives hook events from Claude Code to maintain segment chains.

**Request Body:**
```json
{
  "hook_event_name": "SessionStart" | "PreCompact" | "Stop",
  "session_id": "uuid",
  "transcript_path": "~/.claude/projects/.../session.jsonl",
  "source": "compact" | "clear" | "resume" | "new",
  "trigger": "auto" | "user",
  "command_center_tab_id": "uuid",
  "cwd": "/path/to/project"
}
```

**Events Handled:**
| Event | Purpose |
|-------|---------|
| `PreCompact` | Mark current segment as ending (preparation) |
| `SessionStart` (source=compact) | Append new segment after compaction |
| `SessionStart` (source=clear) | Append new segment after /clear |
| `SessionStart` (source=resume) | Append new segment for --resume |
| `SessionStart` (source=new) | Append first segment for new session |

**Response:**
```json
{ "ok": true, "action": "segment_appended", "segment": { "sessionId": "...", "reason": "compact" } }
```

### Tab Management Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/tabs` | List all tabs |
| GET | `/api/tabs/:tabId` | Get specific tab info |
| POST | `/api/tabs` | Create new tab (from UI) |
| DELETE | `/api/tabs/:tabId` | Delete a tab |

**Create Tab:**
```bash
curl -X POST http://127.0.0.1:4451/api/tabs \
  -H "Content-Type: application/json" \
  -d '{"repoRoot": "/path/to/project"}'
# { "tab": { "tabId": "uuid", "repoRoot": "...", "segments": [] } }
```

**List Tabs:**
```bash
curl http://127.0.0.1:4451/api/tabs
# { "tabs": [...], "count": 3 }
```

### Segment Chain Concept

Tabs maintain a "segment chain" - an ordered list of Claude Code sessions for a repository. When a session compacts (context resets), the new session is appended to the chain. This enables:
- "Kitty effect" - compaction is invisible to the user
- Session history preservation
- PTY continuity across compaction

---

## Database (`db/`)

SQLite persistence for terminal links using Drizzle ORM.

### Tables

| Table | Purpose |
|-------|---------|
| `terminal_links` | Session to kitty window mappings |
| `command_history` | Commands sent to terminals |
| `session_preferences` | Per-session UI preferences |

### TerminalLinkRepo

Repository for terminal link CRUD operations.

```typescript
import { TerminalLinkRepo } from "./db/terminal-link-repo.js";

const repo = new TerminalLinkRepo();
const link = repo.get(sessionId);
repo.upsert({ sessionId, kittyWindowId, linkedAt, stale: false });
repo.markStale(sessionId);
```

---

## Debug Endpoints

### GET /api/debug/sessions

List all sessions known to the watcher. Useful for debugging session discovery.

**Response:**
```json
{
  "total": 42,
  "sessions": [
    {
      "id": "abc123",
      "status": "working",
      "cwd": "/path/to/project",
      "lastActivityAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

> **Note:** Limited to 50 sessions for readability.

---

## JSONL Parser (`parser.ts`)

Incremental JSONL parser for Claude Code session logs.

### `tailJSONL(filepath, fromByte)`

Incrementally read new JSONL entries from file starting at a byte offset.

```typescript
import { tailJSONL } from "./parser.js";

const result = await tailJSONL("/path/to/session.jsonl", 1024);
// result.entries: LogEntry[]
// result.newPosition: number (new byte offset)
// result.hadPartialLine: boolean
// result.skippedCount: number
```

**Returns:** `TailResult`
```typescript
interface TailResult {
  entries: LogEntry[];     // Parsed entries
  newPosition: number;     // New byte offset for next read
  hadPartialLine: boolean; // True if EOF had incomplete line
  skippedCount: number;    // Malformed JSON lines skipped
}
```

### `extractMetadata(entries)`

Extract session metadata from log entries.

```typescript
import { extractMetadata } from "./parser.js";

const metadata = extractMetadata(entries);
// { sessionId, cwd, gitBranch, originalPrompt, startedAt }
```

### `extractSessionId(filepath)`

Get session ID from filepath (removes `.jsonl` extension).

### `decodeProjectDir(encodedDir)`

Decode Claude's directory encoding (dashes to slashes).

```typescript
decodeProjectDir("-Users-kyle-code")
// Returns: "/Users/kyle/code"
```

---

## File Watcher (`watcher.ts`)

Watches `~/.claude/projects/**/*.jsonl` for session changes.

### `SessionWatcher`

```typescript
import { SessionWatcher } from "./watcher.js";

const watcher = new SessionWatcher({ debounceMs: 200 });

watcher.on("session", (event) => {
  // event.type: "created" | "updated" | "deleted"
  // event.session: SessionState
});

watcher.on("error", (error) => {
  console.error("Watch error:", error);
});

await watcher.start();
// Later: await watcher.stop();
```

**Constructor Options:**
```typescript
interface WatcherOptions {
  debounceMs?: number;  // Default: 200
}
```

**Events:**
| Event | Payload | When |
|-------|---------|------|
| `session` | `{ type, session }` | Session created/updated/deleted |
| `error` | `Error` | Watch error occurred |

**Methods:**
| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<void>` | Begin watching |
| `stop()` | `Promise<void>` | Stop watching |
| `getSessions()` | `Map<string, SessionState>` | Get all sessions |

---

## Status Derivation (`status-derivation.ts`)

Derives session status from log entries using the XState state machine.

### Key Functions

#### `deriveStatus(entries: LogEntry[]): StatusResult`

Processes log entries through the state machine to determine current session status.

```typescript
import { deriveStatus } from "./status-derivation.js";

const status = deriveStatus(entries);
// Returns: { status: "working" | "waiting" | "idle", lastRole, hasPendingToolUse, lastActivityAt, messageCount }
```

**Status logic:**
- `working` - Claude is actively processing (streaming or executing tools)
- `waiting` - Claude finished, waiting for user input or approval
  - `hasPendingToolUse: true` if waiting for tool approval
- `idle` - No activity for 10+ minutes

#### `formatStatus(result: StatusResult): string`

Formats status for CLI display with emoji indicators.

```typescript
import { formatStatus } from "./status-derivation.js";

formatStatus({ status: "working", ... }); // "🟢 Working"
formatStatus({ status: "waiting", hasPendingToolUse: true, ... }); // "🟠 Tool pending"
formatStatus({ status: "waiting", hasPendingToolUse: false, ... }); // "🟡 Waiting for input"
formatStatus({ status: "idle", ... }); // "⚪ Idle"
```

#### `statusChanged(prev, next): boolean`

Compares two status results to detect meaningful changes.

```typescript
import { statusChanged } from "./status-derivation.js";

if (statusChanged(previousStatus, newStatus)) {
  // Emit update event
}
```

#### `getStatusKey(result: StatusResult): string`

Returns a short status string for logging.

```typescript
getStatusKey({ status: "waiting", hasPendingToolUse: true, ... }); // "waiting:tool"
getStatusKey({ status: "working", ... }); // "working"
```

### State Machine (`status-machine.ts`)

The underlying XState state machine with four internal states:

| State | Description | UI Mapping |
|-------|-------------|------------|
| `idle` | No activity for 10+ minutes | idle |
| `working` | Claude actively processing | working |
| `waiting_for_approval` | Tool use needs approval | waiting |
| `waiting_for_input` | Finished, waiting for user | waiting |

### Timeout Configuration

| Constant | Value | Trigger |
|----------|-------|---------|
| `APPROVAL_TIMEOUT_MS` | 5 seconds | Stale tool_use detection |
| `STALE_TIMEOUT_MS` | 60 seconds | Fallback for older Claude Code versions |
| `IDLE_TIMEOUT_MS` | 10 minutes | Transition to idle |

---

## Core Types

### SessionState

```typescript
interface SessionState {
  sessionId: string;
  cwd: string;
  gitBranch: string | null;
  originalPrompt: string;
  entries: LogEntry[];
  status: StatusResult;
  goal?: string;
  summary?: string;
  terminalLink?: TerminalLink;
}
```

### StatusResult

```typescript
interface StatusResult {
  status: "working" | "waiting" | "idle";
  lastActivityAt: string;       // ISO timestamp
  hasPendingToolUse: boolean;   // True if waiting for approval
  pendingTool?: string;         // Tool name if pending
}
```

### LogEntry (Discriminated Union)

| Type | Description |
|------|-------------|
| `UserEntry` | User prompts and tool results |
| `AssistantEntry` | Claude responses with TextBlock, ToolUseBlock |
| `SystemEntry` | Hook summaries, turn duration markers |
| `QueueOperationEntry` | Queued prompts |

### TerminalLink

```typescript
interface TerminalLink {
  kittyWindowId: number;
  linkedAt: string;
  stale: boolean;
}
```

---

## File-Based Status System (`status-watcher.ts`, `status-parser.ts`)

Watches `.claude/status.v5.<session_id>.md` files for deterministic session status updates written by Claude Code via hooks.

### Overview

Instead of deriving status from AI summaries, Claude Code writes its own status to `.claude/status.v5.<session_id>.md` files. The daemon watches these files and streams updates to the UI.

### StatusWatcher

```typescript
import { StatusWatcher } from "./status-watcher.js";

const watcher = new StatusWatcher({ debounceMs: 100 });

watcher.on("status", ({ cwd, status }) => {
  console.log(`Status update for ${cwd}: ${status?.status}`);
});

watcher.watchProject("/path/to/project");
const currentStatus = watcher.getStatus("/path/to/project");
```

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `watchProject(cwd)` | `void` | Start watching a project's status file |
| `unwatchProject(cwd)` | `void` | Stop watching a project |
| `getStatus(cwd)` | `FileStatus \| null` | Get cached status (null if stale) |
| `refreshStatus(cwd)` | `Promise<FileStatus \| null>` | Force re-read from disk |
| `stop()` | `void` | Stop all watchers |

**Events:**

| Event | Payload | When |
|-------|---------|------|
| `status` | `{ cwd, status }` | Status file created/changed/deleted |
| `error` | `Error` | Watch error |

### Status File Format

**Location:** `<project>/.claude/status.v5.<session_id>.md`

```markdown
---
status: working
updated: 2026-01-09T14:30:00Z
task: Implementing user authentication
---

## Summary
Adding OAuth integration to the login flow.

## Blockers
None currently

## Next Steps
Complete token refresh logic
```

### Status Taxonomy

| Status | Description | UI Mapping |
|--------|-------------|------------|
| `working` | Actively executing | working |
| `waiting_for_approval` | Tool needs permission | waiting |
| `waiting_for_input` | Needs user response | waiting |
| `completed` | Task finished | idle |
| `error` | Encountered error | idle |
| `blocked` | Cannot proceed | idle |
| `idle` | No active work | idle |

### Parser Functions

```typescript
import { parseStatusFile, isStatusStale, mapToUiStatus } from "./status-parser.js";

// Parse status file content
const parsed = parseStatusFile(fileContent);
// Returns: { frontmatter: { status, updated, task }, summary, blockers, nextSteps }

// Check if status is stale (default 5 min TTL)
const stale = isStatusStale(parsed.frontmatter.updated, STATUS_FILE_TTL_MS);

// Map file status to UI status (7 → 3 states)
const uiStatus = mapToUiStatus("waiting_for_approval"); // "waiting"
```

### Staleness Handling

Status files are valid for **5 minutes** (`STATUS_FILE_TTL_MS`). After expiration:
- `getStatus()` returns `null`
- Falls back to XState-derived status from JSONL logs

### Configuration

| Constant | Value | Purpose |
|----------|-------|---------|
| `STATUS_FILE_TTL_MS` | 5 minutes | Status file validity period |
| `STATUS_FILENAME` | `status.md` | Status file name |
| `STATUS_DIR` | `.claude` | Directory containing status file |

### Hook Integration

Status files are written by Claude Code via hooks:

1. **UserPromptSubmit hook** (`status-working.py`) - Sets status to "working"
2. **Stop hook** (`status-stop.py`) - Sets completion status

See the hook files at `~/.claude/hooks/` after installation.

---

## PTY Bridge (Gateway Integration)

PTY spawning and I/O integrated into the Fleet Gateway WebSocket.

### Architecture

```
UI (Timeline) ⟷ Gateway WebSocket :4452 ⟷ PtyBridge ⟷ node-pty
```

The Gateway WebSocket server (port 4452) handles both session streaming and PTY I/O. PTY stdout is merged with hook events via `event-merger.ts` and rendered in the Timeline.

### Components

| File | Purpose |
|------|---------|
| `gateway/pty-bridge.ts` | PTY spawn, write, destroy |
| `gateway/event-merger.ts` | Merge PTY stdout with hook events |
| `gateway/gateway-server.ts` | WebSocket connection manager |

### PTY API Endpoints (Port 4451)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sessions/:id/pty` | Create PTY, returns {ptyId, wsUrl} |
| GET | `/api/sessions/:id/pty` | Get existing PTY info |
| DELETE | `/api/sessions/:id/pty` | Destroy PTY |

**Create PTY:**
```bash
curl -X POST http://127.0.0.1:4451/api/sessions/abc123/pty \
  -H "Content-Type: application/json" \
  -d '{"cols": 120, "rows": 40}'
# { "ptyId": "pty-uuid", "wsUrl": "ws://127.0.0.1:4452" }
```

### Gateway WebSocket Protocol

PTY events are delivered through the main Gateway WebSocket connection alongside session events.

**Messages (Client → Server):**
```typescript
// PTY input
{ type: "pty:input", sessionId: "abc123", payload: "npm test\n" }

// PTY resize
{ type: "pty:resize", sessionId: "abc123", cols: 100, rows: 30 }
```

**Messages (Server → Client):**
```typescript
// PTY stdout (merged with session events)
{ type: "pty:stdout", sessionId: "abc123", data: "npm test\r\n> running tests..." }
```

### Security

| Mechanism | Description |
|-----------|-------------|
| Localhost binding | Gateway server on 127.0.0.1 only |
| Session scope | Only spawns `claude --resume <sessionId>` |

### Configuration

| Constant | Default | Purpose |
|----------|---------|---------|
| `GATEWAY_HOST` | `127.0.0.1` | Gateway WebSocket host |
| `GATEWAY_PORT` | `4452` | Gateway WebSocket port |
| `PTY_IDLE_TIMEOUT_MS` | 30 minutes | Cleanup inactive PTYs |
| `PTY_DEFAULT_COLS` | 120 | Default terminal width |
| `PTY_DEFAULT_ROWS` | 40 | Default terminal height |

### Send-Text Target

The `/api/sessions/:id/send-text` endpoint supports both PTY and kitty terminals:

1. If PTY exists for session → sends to PTY via Gateway
2. Otherwise → falls back to kitty terminal (if linked)

Response includes `target: "gateway"` or `target: "kitty"` to indicate which terminal received the text.

---

## Related Documentation

- [Configuration Reference](../operations/configuration.md) - All daemon constants
- [Deployment Guide](../operations/deployment.md) - Running the daemon
