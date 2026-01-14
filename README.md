# Mimesis

**Real-time mission control for Claude Code agents.**

Monitor, command, and coordinate multiple Claude Code sessions from a single dashboard. Mimesis transforms session monitoring from passive observation into active fleet operations.

> Think StarCraft for AI agents: persistent terminal as primary instrument, keyboard-driven navigation, cross-agent awareness.

## Fleet Command UI

Mimesis uses a 3-column "Fleet Command" layout inspired by RTS games and Melty:

```
┌─────────────────────────────────────────────────────────────────┐
│ MIMESIS                              Gateway: ● Connected  3/5  │
├─────────────────────────────────────────────────────────────────┤
│ [All: 5] [Working: 2] [Waiting: 1] [Idle: 2]                    │
├────────────┬──────────────────────────────────┬─────────────────┤
│ ROSTER     │ TIMELINE                         │ TACTICAL INTEL  │
│            │                                  │                 │
│ ● proj-a   │ ┌ Tool: Edit api.ts ───────────┐ │ Fleet Events    │
│ ○ proj-b   │ │ Modified lines 45-67         │ │                 │
│ ◐ proj-c   │ └──────────────────────────────┘ │ Session Details │
│            │                                  │                 │
│            │ [Text] Let me explain...         │ Status: working │
│            │                                  │ Branch: main    │
│            │ ┌ Session Input ───────────────┐ │                 │
│            │ │ Send command...         [↵]  │ │                 │
│            │ └──────────────────────────────┘ │                 │
└────────────┴──────────────────────────────────┴─────────────────┘
```

**3 Columns:**
- **Roster** (left) - High-density agent list with status indicators
- **Timeline** (center) - Virtualized event stream with tool cards, text, and session input
- **Tactical Intel** (right) - Fleet events and session details

## Features

### Terminal Integration
- **Kitty native support** - Auto-configured remote control for power users
- **One-click resume** - Click any session to open `claude --resume` instantly
- **Session input** - Send commands and signals to active sessions from the UI

### Real-time Intelligence
- **Fleet Gateway** - WebSocket-based real-time session sync
- **XState machine** - Deterministic status detection (working/waiting/idle)
- **Hook-based status** - Goals and summaries from `.claude/status.v5.<session_id>.md`
- **Timeline view** - Structured event rendering with virtualization

### Keyboard-First Navigation
| Key | Action |
|-----|--------|
| `↑/↓` | Navigate roster/table |
| `Enter` | Enter focus mode |
| `Escape` | Exit focus mode |
| `A` | Filter: All |
| `W` | Filter: Working |
| `I` | Filter: Needs Input |
| `E` | Filter: Errors |
| `S` | Filter: Stale |

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌─────────────────┐
│  Claude Code    │     │           Daemon            │     │       UI        │
│   Sessions      │────▶│   (Watcher + API Server)    │────▶│   (React 19)    │
│  ~/.claude/     │     │                             │     │                 │
│   projects/     │     │  :4451 Hono REST API        │     │  Fleet Command  │
│                 │     │  :4452 Gateway WebSocket    │     │  3-Column       │
│                 │     │                             │     │  Timeline View  │
└─────────────────┘     └─────────────────────────────┘     └─────────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────────┐
                        │   SQLite + Kitty Terminal   │
                        │   ~/.mimesis/               │
                        └─────────────────────────────┘
```

### Daemon (`packages/daemon`)

Watches `~/.claude/projects/` for session log changes:
- Incremental JSONL parsing (tracks byte positions)
- XState state machine for status detection
- Reads `.claude/status.v5.<session_id>.md` hook files for goals/summaries
- Git branch detection
- Fleet Gateway for real-time WebSocket streaming
- REST API for session and terminal control

### UI (`packages/ui`)

React 19 app with Fleet Command interface:
- TanStack Router for navigation
- TanStack Table for data grid
- shadcn/ui components (Radix primitives + Tailwind)
- @tanstack/react-virtual for Timeline virtualization
- Gateway WebSocket client for real-time updates

## Getting Started

```bash
# Install dependencies
pnpm install

# Start both daemon and UI
pnpm start

# Or run separately:
pnpm serve  # Daemon (ports 4451, 4452)
pnpm dev    # UI dev server
```

**Note:** Sessions require `.claude/status.v5.<session_id>.md` files (written by Claude Code hooks) to appear in the dashboard.

## Daemon Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 4451 | HTTP | REST API (health, sessions, kitty control) |
| 4452 | WebSocket | Fleet Gateway (sessions, events, jobs) |

## Session Status State Machine

The daemon uses XState to derive session status from log events:

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
         │              TURN_END    ASSISTANT_   STALE_
         │                    │      TOOL_USE   TIMEOUT
         │                    ▼            │            │
         │            ┌─────────────────┐  │            │
         │            │ waiting_for_   │◄─┘            │
         └───────────▶│     input      │◄──────────────┘
           IDLE_      └─────────────────┘
          TIMEOUT
```

**Timeout fallbacks** for older Claude Code versions:
- **5 seconds** - Pending tool → `waiting_for_approval`
- **60 seconds** - Stale working → `waiting_for_input`
- **5 minutes** - No activity → `idle`

## Kitty Terminal Integration

Native integration with [kitty terminal](https://sw.kovidgoyal.net/kitty/) for power users who prefer their own terminal.

**Auto-setup on first run:**
1. Creates `~/.config/kitty/claude-code.conf` with socket-only remote control
2. Adds include directive to `kitty.conf`
3. Sends SIGUSR1 to reload config

**Session linking:**
- "Open in Kitty" creates a new tab with `claude --resume <sessionId>`
- Links are persisted in SQLite and recovered across kitty restarts
- Focus, send text, and unlink from the UI

## API Endpoints

All endpoints prefixed with `/api/v1` on port 4451:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/kitty/health` | GET | Kitty socket status |
| `/kitty/setup` | POST | Manual kitty configuration |
| `/sessions/:id/open` | POST | Open/focus session in kitty |
| `/sessions/:id/focus` | POST | Focus linked terminal |
| `/sessions/:id/send-text` | POST | Send text to terminal |
| `/sessions/:id/pty` | POST | Create embedded PTY |
| `/sessions/:id/pty` | GET | Get PTY info |
| `/sessions/:id/pty` | DELETE | Destroy PTY |
| `/debug/sessions` | GET | List all sessions |

## File Locations

| Path | Description |
|------|-------------|
| `~/.claude/projects/` | Claude Code session logs (JSONL) |
| `~/.mimesis/data.db` | SQLite database (terminal links) |
| `~/.claude/commander/fleet.db` | Fleet database (briefings, jobs) |
| `~/.config/kitty/claude-code.conf` | Kitty remote control config |

## Documentation

| Document | Description |
|----------|-------------|
| [docs/index.md](docs/index.md) | Documentation hub |
| [docs/getting-started.md](docs/getting-started.md) | Setup and first run |
| [docs/cli-reference.md](docs/cli-reference.md) | CLI commands and flags |
| [docs/ui-components.md](docs/ui-components.md) | React component guide |
| [docs/api/daemon-api.md](docs/api/daemon-api.md) | REST API reference |
| [CLAUDE.md](CLAUDE.md) | Claude Code project guidance |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20.19+ |
| Package Manager | pnpm |
| File Watching | chokidar v4 |
| State Machine | XState v5 |
| Gateway | WebSocket (ws) |
| REST API | Hono |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| UI Framework | React 19 |
| Routing | TanStack Router |
| Tables | TanStack Table v8 |
| UI Components | shadcn/ui + Tailwind CSS v4 |
| Virtualization | @tanstack/react-virtual |

## Credits

Inspired by and originally forked from [Kyle Mathews' claude-code-ui](https://github.com/KyleAMathews/claude-code-ui).
