# Configuration Reference

Complete reference for all environment variables and tunable constants.

## Environment Variables

### Daemon

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_HOST` | `127.0.0.1` | REST API bind address |
| `API_PORT` | `4451` | REST API port |
| `GATEWAY_HOST` | `127.0.0.1` | Gateway WebSocket bind address |
| `GATEWAY_PORT` | `4452` | Gateway WebSocket port |
| `MAX_AGE_HOURS` | `24` | Filter sessions older than this |
| `KITTY_SOCKET` | `unix:/tmp/claude-cc-kitty` | Kitty remote control socket |
| `KITTY_RC_PASSWORD` | (none) | Password for kitty remote control |
| `DB_PATH` | `~/.mimesis/data.db` | SQLite database path |

### Optional - UI

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://127.0.0.1:4451/api` | REST API endpoint |
| `VITE_GATEWAY_URL` | `ws://127.0.0.1:4452` | Gateway WebSocket endpoint |

---

## Internal Constants

These constants are defined in `packages/daemon/src/config.ts` and affect daemon behavior.

### Timeout Configuration

| Constant | Value | Purpose |
|----------|-------|---------|
| `IDLE_TIMEOUT_MS` | 10 minutes | Session marked idle after inactivity |
| `APPROVAL_TIMEOUT_MS` | 5 seconds | Time before stale tool_use detection |
| `STALE_TIMEOUT_MS` | 60 seconds | Fallback for older Claude Code versions |
| `RECENT_THRESHOLD_MS` | 1 hour | `--recent` flag filter threshold |

### Session Scoring (UI)

| Constant | Value | Purpose |
|----------|-------|---------|
| `STATUS_WEIGHTS` | working:100, waiting:50, idle:1 | Base score by status |
| `PENDING_TOOL_BONUS` | 30 | Bonus for pending tool approval |
| `DECAY_HALF_LIFE_MINUTES` | 30 | Activity score decay rate |

### Kitty Terminal Control

| Constant | Value | Purpose |
|----------|-------|---------|
| `KITTY_SOCKET` | `unix:/tmp/claude-cc-kitty` | Kitty remote control socket path |
| `KITTY_PASSWORD_ENV` | `KITTY_RC_PASSWORD` | Env var name for kitty password |
| `KITTY_COMMAND_TIMEOUT_MS` | 5 seconds | Timeout for kitty commands |
| `API_PORT` | `4451` | Port for terminal control API |
| `API_PREFIX` | `/api` | URL prefix for API endpoints |

### Gateway PTY Configuration

PTY sessions are managed via the Gateway WebSocket (port 4452), displayed in the Timeline component.

| Constant | Value | Purpose |
|----------|-------|---------|
| `PTY_IDLE_TIMEOUT_MS` | 30 minutes | Cleanup inactive PTY sessions |
| `PTY_DEFAULT_COLS` | `120` | Default terminal width for PTY spawn |
| `PTY_DEFAULT_ROWS` | `40` | Default terminal height for PTY spawn |
| `PTY_OUTPUT_BUFFER_SIZE` | 5000 | Max chunks in output replay buffer |

**Note:** PTY I/O is streamed through the Gateway WebSocket, not a separate xterm.js server. The UI Timeline component renders events from the Gateway.

---

## Configuration Examples

### Development (default)

No configuration needed - uses defaults.

### Production (custom host/port)

```bash
# .env
API_HOST=0.0.0.0
GATEWAY_HOST=0.0.0.0
MAX_AGE_HOURS=48
```

### UI connecting to remote daemon

```bash
# packages/ui/.env
VITE_API_URL=http://192.168.1.100:4451/api
VITE_GATEWAY_URL=ws://192.168.1.100:4452
```

---

## Related Documentation

- [Deployment Guide](deployment.md) - Production setup with PM2/systemd
- [CLI Reference](../cli-reference.md) - Command line flags
