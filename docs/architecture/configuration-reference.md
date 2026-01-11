# Configuration System Reference

Complete reference for all daemon configuration modules.

## Overview

Configuration is centralized in `packages/daemon/src/config/` with domain-specific modules:

| Module | Purpose |
|--------|---------|
| `paths.ts` | File paths, database locations, API settings |
| `server.ts` | Server lifecycle, startup, shutdown timeouts |
| `timeouts.ts` | Session state timeout thresholds |
| `pty.ts` | PTY spawn and WebSocket settings |
| `scoring.ts` | Session ranking weights for UI sorting |
| `content.ts` | Content length limits for display |
| `fleet.ts` | Fleet Commander database and job settings |
| `stream.ts` | Durable Streams configuration |
| `ai.ts` | AI generation limits and cache settings |

All modules are re-exported via `config/index.ts`.

---

## Paths Configuration (`paths.ts`)

### Database

| Constant | Default | Purpose |
|----------|---------|---------|
| `DB_PATH` | `~/.mimesis/data.db` | SQLite database for terminal links |
| `STREAM_DATA_DIR` | `~/.mimesis/streams` | Durable Streams persistence |

### Status Files

| Constant | Value | Purpose |
|----------|-------|---------|
| `STATUS_FILE_TTL_MS` | 5 minutes | Staleness threshold for `.claude/status.md` |
| `STATUS_FILENAME` | `status.md` | Legacy status file name |
| `STATUS_FILE_PATTERN` | `/^status\.(.+)\.md$/` | Session-specific status file pattern |
| `STATUS_DIR` | `.claude` | Directory containing status files |

### Kitty Remote Control

| Constant | Default | Purpose |
|----------|---------|---------|
| `KITTY_SOCKET` | `unix:/tmp/claude-cc-kitty` | Kitty remote control socket |
| `KITTY_PASSWORD_ENV` | `KITTY_RC_PASSWORD` | Environment variable for password |
| `KITTY_COMMAND_TIMEOUT_MS` | 5 seconds | Command execution timeout |

### API Server

| Constant | Default | Purpose |
|----------|---------|---------|
| `API_PORT` | `4451` | REST API server port |
| `API_PREFIX` | `/api` | URL prefix for endpoints |

---

## Server Lifecycle (`server.ts`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `PORT_CHECK_SOCKET_TIMEOUT_MS` | 1 second | Port availability check timeout |
| `DAEMON_HEALTH_CHECK_TIMEOUT_MS` | 2 seconds | Detect running daemon instances |
| `PORT_RELEASE_WAIT_MS` | 500ms | Wait after killing process for port release |
| `WATCHER_DEBOUNCE_MS` | 300ms | Session file watcher debounce |
| `STATUS_WATCHER_DEBOUNCE_MS` | 100ms | Status file watcher debounce |
| `SHUTDOWN_TIMEOUT_MS` | 5 seconds | Maximum graceful shutdown wait |

---

## Timeout Configuration (`timeouts.ts`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `IDLE_TIMEOUT_MS` | 10 minutes | Session marked idle after inactivity |
| `APPROVAL_TIMEOUT_MS` | 5 seconds | Detect pending tool approval |
| `STALE_TIMEOUT_MS` | 60 seconds | Fallback for older Claude Code versions |
| `RECENT_THRESHOLD_MS` | 1 hour | `--recent` CLI flag filter |

---

## PTY Configuration (`pty.ts`)

| Constant | Default | Purpose |
|----------|---------|---------|
| `PTY_WS_HOST` | `127.0.0.1` | Gateway WebSocket bind address |
| `PTY_WS_PORT` | `4452` | Gateway WebSocket port |
| `PTY_IDLE_TIMEOUT_MS` | 30 minutes | Destroy inactive PTY sessions |
| `PTY_DEFAULT_COLS` | `120` | Default terminal width |
| `PTY_DEFAULT_ROWS` | `40` | Default terminal height |
| `PTY_IDLE_CHECK_INTERVAL_MS` | 1 minute | Idle check interval |

---

## Session Scoring (`scoring.ts`)

Used by UI to sort and prioritize sessions.

| Constant | Value | Purpose |
|----------|-------|---------|
| `STATUS_WEIGHTS.working` | 100 | Base score for working sessions |
| `STATUS_WEIGHTS.waiting` | 50 | Base score for waiting sessions |
| `STATUS_WEIGHTS.idle` | 1 | Base score for idle sessions |
| `PENDING_TOOL_BONUS` | 30 | Bonus for pending tool approval |
| `DECAY_HALF_LIFE_MINUTES` | 30 | Score decay half-life |

---

## Content Limits (`content.ts`)

### Text Truncation

| Constant | Value | Purpose |
|----------|-------|---------|
| `CONTENT_TRUNCATE_LENGTH` | 300 | Standard text truncation |
| `CONTENT_PREVIEW_LENGTH` | 500 | Preview for longer content |
| `USER_PROMPT_TRUNCATE_LENGTH` | 200 | User prompt display limit |
| `SHORT_CONTENT_LENGTH` | 50 | JSON/tool input display |
| `CONTEXT_TEXT_LENGTH` | 150 | Context text blocks |
| `COMMAND_TRUNCATE_LENGTH` | 60 | Command display limit |
| `GOAL_TRUNCATE_LENGTH` | 50 | Goal text limit |

### Entry Counts

| Constant | Value | Purpose |
|----------|-------|---------|
| `MESSAGE_LOOKBACK_COUNT` | 20 | Messages to scan for output |
| `SESSION_ID_DISPLAY_LENGTH` | 8 | Session ID display chars |
| `EARLY_ENTRIES_COUNT` | 5 | Early entries for context |
| `RECENT_ENTRIES_COUNT` | 10 | Recent entries for context |
| `RECENT_OUTPUT_MAX_ITEMS` | 8 | Max items in recent output |

---

## Fleet Commander (`fleet.ts`)

### Paths

| Constant | Default | Purpose |
|----------|---------|---------|
| `FLEET_BASE_DIR` | `~/.claude/commander` | Fleet data directory |
| `FLEET_DB_PATH` | `~/.claude/commander/fleet.db` | Fleet SQLite database |
| `FLEET_GATEWAY_SOCKET` | `~/.claude/commander/gateway.sock` | Hook IPC socket |
| `FLEET_SESSIONS_DIR` | `~/.claude/commander/sessions` | Session PID files |
| `FLEET_SCHEMAS_DIR` | `~/.claude/commander/schemas` | JSON schemas |

### Gateway

| Constant | Value | Purpose |
|----------|-------|---------|
| `FLEET_GATEWAY_PORT` | `4452` | Gateway WebSocket port |
| `FLEET_GATEWAY_HOST` | `127.0.0.1` | Gateway bind address |
| `RING_BUFFER_SIZE_BYTES` | 20 MB | Per-session ring buffer |
| `OUTBOX_POLL_INTERVAL_MS` | 1 second | Outbox polling interval |

### Job Limits

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_CONCURRENT_JOBS` | 3 | Max parallel headless jobs |
| `MAX_JOBS_PER_PROJECT` | 1 | Max jobs per project |
| `JOB_TIMEOUT_MS` | 5 minutes | Job execution timeout |

### Signal Escalation

| Constant | Value | Purpose |
|----------|-------|---------|
| `SIGINT_TO_SIGTERM_MS` | 3 seconds | Wait before escalating |
| `SIGTERM_TO_SIGKILL_MS` | 5 seconds | Wait before force kill |

---

## Environment Variable Overrides

These constants can be overridden via environment variables:

| Variable | Config | Default |
|----------|--------|---------|
| `DB_PATH` | `paths.DB_PATH` | `~/.mimesis/data.db` |
| `STREAM_DATA_DIR` | `paths.STREAM_DATA_DIR` | `~/.mimesis/streams` |
| `KITTY_SOCKET` | `paths.KITTY_SOCKET` | `unix:/tmp/claude-cc-kitty` |
| `API_PORT` | `paths.API_PORT` | `4451` |
| `PTY_WS_HOST` | `pty.PTY_WS_HOST` | `127.0.0.1` |
| `PTY_WS_PORT` | `pty.PTY_WS_PORT` | `4452` |

---

## Related Documentation

- [Configuration (Environment Variables)](../operations/configuration.md)
- [Gateway Architecture](gateway.md)
- [Fleet DB Schema](fleet-db.md)
