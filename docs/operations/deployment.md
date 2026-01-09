# Deployment Guide

How to run Mimesis in production.

## Prerequisites

- **Node.js** 22.13.1 or later
- **pnpm** 10.26.0 or later

---

## Environment Variables

### Daemon (packages/daemon)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STREAM_HOST` | No | `127.0.0.1` | Host to bind stream server |
| `PORT` | No | `4450` | Port for stream server |
| `MAX_AGE_HOURS` | No | `24` | Filter sessions older than this |

### UI (packages/ui)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_STREAM_URL` | No | `http://127.0.0.1:4450/sessions` | URL to daemon stream endpoint |

See [Configuration Reference](configuration.md) for all internal constants.

---

## Development

```bash
# Install dependencies
pnpm install

# Start both daemon and UI
pnpm start

# Or run separately:
pnpm serve  # Daemon on port 4450
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
| `~/.mimesis/streams/` | Durable Streams persistence | Daemon |

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
| 4450 | Durable Streams server | Yes (`PORT` env var) |
| 5173 | UI dev server (Vite) | Yes (vite.config.ts) |

---

## Health Checks

### Daemon Health

Check if daemon is responding:

```bash
curl http://127.0.0.1:4450/sessions
# Should return SSE stream
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

1. Check Node.js version: `node --version` (need 22.13.1+)
2. Check port: `lsof -i :4450`

### Sessions not appearing

1. Verify Claude Code is running: `ls ~/.claude/projects/`
2. Check file permissions on `~/.claude/projects/`
3. Run `pnpm watch` to debug file detection
4. Note: Only sessions with `.claude/status.md` files (hook system) are shown

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
