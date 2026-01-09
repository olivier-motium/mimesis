# CLI Reference

The daemon provides multiple ways to watch Claude Code sessions.

## Commands

### Start Full Stack (Recommended)

```bash
pnpm start
```

Runs both the daemon server (port 4450) and UI dev server (port 5173) concurrently.

### Daemon Server Only

```bash
pnpm serve
```

Starts the Durable Streams server on port 4450. The UI can connect to this endpoint for live updates.

### CLI Watcher (No Server)

```bash
pnpm watch
```

Runs a terminal-based watcher that outputs session status to stdout with ANSI colors. Does not start the Durable Streams server.

---

## Watcher Flags

### `--recent`

```bash
pnpm watch:recent
# or
pnpm watch --recent
```

Shows only sessions with activity in the last hour.

**Threshold:** `RECENT_THRESHOLD_MS = 3600000` (1 hour)

Use this to filter out old sessions and focus on current work.

### `--active`

```bash
pnpm watch:active
# or
pnpm watch --active
```

Shows only sessions that are NOT idle.

**Filter:** Excludes sessions where `status === 'idle'`

Use this to see only sessions that are working, waiting for input, or need approval.

---

## Output Format

Sessions are displayed grouped by working directory with color-coded status:

```
/Users/kyle/code/my-project
  ├── [WORKING]  abc123  "Add dark mode support"
  └── [WAITING]  def456  "Fix login bug"

/Users/kyle/code/other-project
  └── [IDLE]     ghi789  "Refactor API"
```

### Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| WORKING | Green | Claude is actively processing |
| WAITING | Yellow | Waiting for user input |
| APPROVAL | Orange | Tool use needs user approval |
| IDLE | Gray | No activity for 10+ minutes |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | Claude API key (optional) |
| `GITHUB_TOKEN` | No | GitHub API for PR status (uses `gh` CLI auth if not set) |

---

## Examples

### Watch only active sessions from the last hour

```bash
pnpm watch --recent --active
```

### Run server for UI without watching

```bash
pnpm serve
# Then in another terminal:
pnpm dev
```

### Debug a specific session

1. Run `pnpm watch` to find the session ID
2. Check the JSONL file at `~/.claude/projects/<encoded-dir>/<session-id>.jsonl`

---

## Database Management

The daemon uses SQLite (via Drizzle ORM) for persistent storage.

### Generate Migrations

```bash
pnpm --filter @mimesis/daemon db:generate
```

Creates Drizzle ORM schema migrations from `src/db/schema.ts` changes.

### Apply Migrations

```bash
pnpm --filter @mimesis/daemon db:migrate
```

Applies pending migrations to the SQLite database.

### Database Studio

```bash
pnpm --filter @mimesis/daemon db:studio
```

Opens Drizzle Studio GUI for database inspection and editing.

**Database location:** `~/.mimesis/data.db`

---

## Kitty Terminal Setup

### Automatic Setup

Kitty terminal remote control is automatically configured when the daemon starts.

### Manual Setup

```bash
pnpm --filter @mimesis/daemon setup:kitty
```

Manually run the kitty setup process if automatic setup failed.
