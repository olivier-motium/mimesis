# Mimesis

A real-time dashboard for monitoring Claude Code sessions across multiple projects. See what Claude is working on, which sessions need approval, and control sessions directly from the UI.

## Features

- **Real-time updates** via Durable Streams
- **Kanban board** showing sessions by status (Working, Needs Approval, Waiting, Idle)
- **Hook-based status** from `.claude/status.md` files
- **PR & CI tracking** - see associated PRs and their CI status
- **Multi-repo support** - sessions grouped by GitHub repository
- **Kitty terminal integration** - open sessions in terminal, send commands, focus windows

https://github.com/user-attachments/assets/877a43af-25f9-4751-88eb-24e7bbda68da

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌─────────────────┐
│  Claude Code    │     │           Daemon            │     │       UI        │
│   Sessions      │────▶│   (Watcher + API Server)    │────▶│   (React)       │
│  ~/.claude/     │     │                             │     │                 │
│   projects/     │     │  Port 4450: Durable Streams │     │  TanStack DB    │
│                 │     │  Port 4451: Hono REST API   │     │                 │
└─────────────────┘     └─────────────────────────────┘     └─────────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────────┐
                        │   SQLite + Kitty Terminal   │
                        │   ~/.mimesis/               │
                        └─────────────────────────────┘
```

### Daemon (`packages/daemon`)

Watches `~/.claude/projects/` for session log changes and:
- Parses JSONL log files incrementally
- Derives session status using XState state machine
- Reads status from `.claude/status.md` hook files
- Detects git branches and polls for PR/CI status
- Publishes state updates to Durable Streams
- Provides REST API for terminal control

### UI (`packages/ui`)

React app using TanStack Router and Radix UI:
- Subscribes to Durable Streams for real-time updates
- Groups sessions by GitHub repository
- Shows session cards with goal, summary, branch/PR info
- Hover cards with recent output preview
- Terminal control buttons (Open in Kitty, Send Text, Focus)

## Kitty Terminal Integration

The dashboard integrates with [kitty terminal](https://sw.kovidgoyal.net/kitty/) for direct session control.

### Features

| Action | Description |
|--------|-------------|
| **Open in Kitty** | Opens a new tab with `claude --resume <sessionId>` |
| **Focus Terminal** | Brings the linked kitty window to front |
| **Send Text** | Types text into the terminal (with optional Enter) |

### How It Works

1. **Auto-setup**: On first run, the daemon configures kitty for remote control:
   - Creates `~/.config/kitty/claude-code.conf` with socket-only mode
   - Adds `include claude-code.conf` to kitty.conf
   - Sends SIGUSR1 to reload kitty config

2. **Session linking**: When you click "Open in Kitty":
   - Creates a new tab with `--var cc_session_id=<sessionId>`
   - Runs `claude --resume <sessionId> --dangerously-skip-permissions`
   - Stores the link in SQLite at `~/.mimesis/data.db`

3. **Link recovery**: Kitty window IDs are ephemeral (change on restart). The daemon recovers links using:
   - Stored window ID (fast path)
   - `user_vars.cc_session_id` (set via `--var`)
   - Cmdline search for `--resume <sessionId>`

### Requirements

- [kitty terminal](https://sw.kovidgoyal.net/kitty/) installed and running
- Socket at `unix:/tmp/kitty-$USER` (auto-configured)

## Session Status State Machine

The daemon uses an XState state machine to determine session status:

```
                    ┌─────────────────┐
                    │      idle       │
                    └────────┬────────┘
                             │ USER_PROMPT
                             ▼
┌─────────────────┐  TOOL_RESULT  ┌─────────────────┐
│ waiting_for_    │◄──────────────│     working     │
│   approval      │               └────────┬────────┘
└────────┬────────┘                        │
         │                    ┌────────────┼────────────┐
         │                    │            │            │
         │              TURN_END    ASSISTANT_   STALE_
         │                    │      TOOL_USE   TIMEOUT
         │                    ▼            │            │
         │            ┌─────────────────┐  │            │
         │            │ waiting_for_   │◄─┘            │
         └───────────▶│     input      │◄──────────────┘
           IDLE_      └─────────────────┘
          TIMEOUT
```

### States

| State | Description | UI Column |
|-------|-------------|-----------|
| `idle` | No activity for 5+ minutes | Idle |
| `working` | Claude is actively processing | Working |
| `waiting_for_approval` | Tool use needs user approval | Needs Approval |
| `waiting_for_input` | Claude finished, waiting for user | Waiting |

### Timeout Fallbacks

For older Claude Code versions or sessions without hooks:
- **5 seconds**: If tool_use pending → `waiting_for_approval`
- **60 seconds**: If no turn-end marker → `waiting_for_input`
- **5 minutes**: No activity → `idle`

## Development

```bash
# Install dependencies
pnpm install

# Start both daemon and UI
pnpm start

# Or run separately:
pnpm serve  # Start daemon (ports 4450 + 4451)
pnpm dev    # Start UI dev server
```

### Daemon Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 4450 | SSE | Durable Streams (session state sync) |
| 4451 | HTTP | REST API (terminal control, health checks) |

### API Endpoints (Port 4451)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/kitty/health` | GET | Check kitty socket connectivity |
| `/kitty/setup` | POST | Trigger manual kitty configuration |
| `/sessions/:id/open` | POST | Open session in kitty (or focus existing) |
| `/sessions/:id/focus` | POST | Focus linked terminal window |
| `/sessions/:id/send-text` | POST | Send text to terminal |
| `/sessions/:id/link-terminal` | POST | Link via interactive picker |
| `/sessions/:id/link-terminal` | DELETE | Unlink terminal |

## Environment Variables

```bash
# Optional: GitHub PR/CI status (uses gh CLI auth if not set)
export GITHUB_TOKEN=ghp_...
```

## File Locations

| Path | Description |
|------|-------------|
| `~/.claude/projects/` | Claude Code session logs (JSONL) |
| `~/.mimesis/data.db` | SQLite database (terminal links, history) |
| `~/.mimesis/streams/` | Durable Streams persistence |
| `~/.config/kitty/claude-code.conf` | Kitty remote control config |

## Documentation

| Document | Description |
|----------|-------------|
| [docs/index.md](docs/index.md) | Documentation hub - start here |
| [docs/cli-reference.md](docs/cli-reference.md) | CLI commands and flags |
| [docs/ui-components.md](docs/ui-components.md) | React component guide |
| [docs/api/daemon-api.md](docs/api/daemon-api.md) | REST API reference |
| [docs/summarizer.md](docs/summarizer.md) | AI summarization service |
| [CLAUDE.md](CLAUDE.md) | Claude Code project guidance |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+ |
| Package Manager | pnpm |
| File Watching | chokidar |
| State Machine | XState v5 |
| Streaming | @durable-streams/* |
| REST API | Hono |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| UI Framework | React 19 |
| Routing | TanStack Router |
| UI Components | Radix UI Themes |
