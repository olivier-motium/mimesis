# Deployment Guide

How to run Mimesis in production.

## Prerequisites

- **Node.js** 20.19.0 or later
- **pnpm** 10.26.0 or later

---

## Environment Variables

### Daemon (packages/daemon)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_HOST` | No | `127.0.0.1` | Host to bind REST API server |
| `API_PORT` | No | `4451` | Port for REST API server |
| `GATEWAY_PORT` | No | `4452` | Port for Gateway WebSocket server |
| `MAX_AGE_HOURS` | No | `24` | Filter sessions older than this |

### UI (packages/ui)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://127.0.0.1:4451` | URL to daemon REST API |
| `VITE_GATEWAY_URL` | No | `ws://127.0.0.1:4452` | URL to Gateway WebSocket |

See [Configuration Reference](configuration.md) for all internal constants.

---

## Development

```bash
# Install dependencies
pnpm install

# Start both daemon and UI
pnpm start

# Or run separately:
pnpm serve  # Daemon: REST API on port 4451, Gateway on port 4452
pnpm dev    # UI on port 5173
```

---

## Production Deployment

### Option 1: PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start daemon
pm2 start pnpm --name "mimesis-daemon" -- serve

# Start UI (if serving built assets)
cd packages/ui && pnpm build
pm2 start pnpm --name "mimesis-ui" -- preview

# Save configuration
pm2 save
pm2 startup
```

### Option 2: macOS launchd

Create `~/Library/LaunchAgents/com.mimesis.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mimesis.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/pnpm</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/mimesis</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/mimesis.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/mimesis.error.log</string>
</dict>
</plist>
```

Load with:
```bash
launchctl load ~/Library/LaunchAgents/com.mimesis.daemon.plist
```

### Option 3: Linux systemd

Create `/etc/systemd/user/mimesis.service`:

```ini
[Unit]
Description=Mimesis Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/mimesis
ExecStart=/usr/bin/pnpm serve
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

Enable with:
```bash
systemctl --user enable mimesis
systemctl --user start mimesis
```

---

## Data Locations

| Path | Purpose | Managed By |
|------|---------|------------|
| `~/.claude/projects/` | Session log files | Claude Code (read-only) |
| `~/.mimesis/data.db` | SQLite database | Daemon |
| `~/.claude/commander/fleet.db` | Fleet briefing ledger | Daemon |

### Log Retention

Claude Code retains logs for 30 days by default. Extend via `~/.claude/settings.json`:

```json
{
  "logRetentionDays": 99999
}
```

---

## Ports

| Port | Service | Configurable |
|------|---------|--------------|
| 4451 | REST API (Hono) | Yes (`API_PORT` env var) |
| 4452 | Gateway WebSocket | Yes (`GATEWAY_PORT` env var) |
| 5173 | UI dev server (Vite) | Yes (vite.config.ts) |

---

## Health Checks

### Daemon Health

Check if daemon is responding:

```bash
# Check REST API
curl http://127.0.0.1:4451/api/health
# Should return {"status":"ok"}

# Check Gateway WebSocket (requires wscat or similar)
wscat -c ws://127.0.0.1:4452
# Should connect successfully
```

### UI Health

Check if UI is serving:

```bash
curl http://localhost:5173
# Should return HTML
```

---

## Troubleshooting

### Daemon won't start

1. Check Node.js version: `node --version` (need 20.19.0+)
2. Port conflicts are handled automatically:
   - Daemon pings existing health endpoint at startup
   - If healthy daemon exists, exits gracefully with message
   - If stale process detected, automatically kills and restarts
3. Manual cleanup if needed: `lsof -i :4451 -i :4452 | grep LISTEN | awk '{print $2}' | xargs kill`

### Sessions not appearing

1. Verify Claude Code is running: `ls ~/.claude/projects/`
2. Check file permissions on `~/.claude/projects/`
3. Run `pnpm watch` to debug file detection
4. Note: Only sessions with `.claude/status.v5.<session_id>.md` files (hook system) are shown

---

## Building for Production

```bash
# Build UI
cd packages/ui
pnpm build

# Output in packages/ui/dist/
# Serve with any static file server
```

### Serving Built UI

```bash
# Using Vite preview
pnpm preview

# Or with any static server
npx serve packages/ui/dist
```

---

## Related Documentation

- [Configuration Reference](configuration.md) - All environment variables and tunables
- [CLI Reference](../cli-reference.md) - Command line flags
