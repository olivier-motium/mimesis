# Getting Started

Get up and running with Mimesis in under 5 minutes.

## Prerequisites

- **Node.js** 22.13.1 or later
- **pnpm** 10.26.0 or later
- **Claude Code CLI** installed and used at least once

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd mimesis
pnpm install
```

### 2. Start the Application

```bash
pnpm start
```

This starts:
- **Daemon REST API** on port 4451 (session management)
- **Daemon Gateway** on port 4452 (WebSocket for live updates)
- **UI** on port 5173 (Vite dev server)

### 4. Open the Dashboard

Navigate to [http://localhost:5173](http://localhost:5173)

You should see your active Claude Code sessions appear in the Fleet Command interface.

## What You'll See

The dashboard uses a 3-column Fleet Command layout:

| Zone | Component | Purpose |
|------|-----------|---------|
| **Left** | Roster | High-density agent list with status indicators |
| **Center** | Timeline | Virtualized event stream (tool steps, text, thinking) |
| **Right** | Tactical Intel | Plan steps and modified artifacts |

Session status is derived from hook-based `.claude/status.md` files:

| Status | Meaning |
|--------|---------|
| **Working** | Claude is actively processing |
| **Waiting for Approval** | Tool use pending (`hasPendingToolUse: true`) |
| **Waiting for Input** | Claude finished, waiting for your input |
| **Idle** | No activity for 10+ minutes |

Each session shows:
- Hook-based goal and summary from `.claude/status.md`
- Current git branch

## Verify It's Working

1. Open a terminal and start a Claude Code session:
   ```bash
   cd /path/to/any/project
   claude
   ```

2. Ask Claude to do something (e.g., "What files are in this directory?")

3. The session should appear in the dashboard within seconds

## Optional: Kitty Terminal Integration

If you use [kitty terminal](https://sw.kovidgoyal.net/kitty/), terminal control is **automatically configured** on first daemon start:

- Creates `~/.config/kitty/claude-code.conf` with remote control settings
- Adds include directive to your `kitty.conf`
- Reloads kitty config (or restart kitty if needed)

After setup, you can:
- Click "Open in kitty" to launch terminals for sessions
- Link existing terminals to sessions
- Send text directly to linked terminals

For manual setup: `pnpm --filter @mimesis/daemon setup:kitty`

## Running Separately

If you prefer to run daemon and UI in separate terminals:

```bash
# Terminal 1: Daemon
pnpm serve

# Terminal 2: UI
pnpm dev
```

## CLI Flags

Filter sessions when starting:

```bash
pnpm watch --recent   # Only sessions from last hour
pnpm watch --active   # Only non-idle sessions
```

## Next Steps

- [CLI Reference](cli-reference.md) - All command options
- [UI Components](ui-components.md) - Understanding the interface
- [Configuration](operations/configuration.md) - All environment variables
- [Deployment](operations/deployment.md) - Production setup

## Troubleshooting

**Sessions not appearing?**
- Verify Claude Code is running: `ls ~/.claude/projects/`
- Check file permissions on `~/.claude/projects/`
- Note: Only sessions with `.claude/status.md` files (hook system) are shown

**Port already in use?**
- Check what's using daemon ports: `lsof -i :4451 -i :4452`
- Use different ports: `API_PORT=4461 GATEWAY_PORT=4462 pnpm serve`

See [Deployment Guide](operations/deployment.md) for more troubleshooting tips.
