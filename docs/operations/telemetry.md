# Telemetry & Observability

The Mimesis daemon exports traces and metrics via OpenTelemetry to [Logfire](https://logfire.pydantic.dev) (EU region).

## Configuration

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `LOGFIRE_MIMESIS_WRITE_TOKEN` | Token for exporting traces/metrics |
| `LOGFIRE_MIMESIS_READ_TOKEN` | Token for MCP server queries |

Add to `.env`:
```bash
LOGFIRE_MIMESIS_WRITE_TOKEN=pylf_v1_eu_...
LOGFIRE_MIMESIS_READ_TOKEN=pylf_v1_eu_...
```

### Telemetry Config

Located at `packages/daemon/src/config/telemetry.ts`:

| Setting | Default | Description |
|---------|---------|-------------|
| `serviceName` | `mimesis-daemon` | Service name in traces |
| `endpoint` | `https://logfire-eu.pydantic.dev` | OTLP endpoint |
| `metricsIntervalMs` | `60000` | Metric export interval |

## Metrics Exported

| Metric | Type | Description |
|--------|------|-------------|
| `mimesis.sessions.active` | Gauge | Active session count |
| `mimesis.pty.active` | Gauge | Active PTY sessions |
| `mimesis.gateway.connections` | Gauge | WebSocket connections |
| `mimesis.file.parse_duration` | Histogram | JSONL parse time (ms) |
| `mimesis.errors.count` | Counter | Errors by type |
| `mimesis.messages.processed` | Counter | Messages by type |

## Spans

Key spans traced:
- `db.initialize` - Database setup
- HTTP requests (auto-instrumented)

## MCP Server Integration

For Claude Code debugging, add the Logfire MCP server:

```bash
claude mcp add logfire \
  -e LOGFIRE_READ_TOKEN="$LOGFIRE_MIMESIS_READ_TOKEN" \
  -- uvx logfire-mcp@latest --base-url https://api-eu.pydantic.dev
```

Or via project config (`.claude/settings.local.json`):
```json
{
  "mcpServers": {
    "logfire": {
      "command": "uvx",
      "args": ["logfire-mcp@latest", "--base-url", "https://api-eu.pydantic.dev"],
      "env": {
        "LOGFIRE_READ_TOKEN": "${LOGFIRE_MIMESIS_READ_TOKEN}"
      }
    }
  }
}
```

Then ask Claude: "What exceptions occurred in the last hour?"

## Disabling Telemetry

Unset or empty the write token:
```bash
LOGFIRE_MIMESIS_WRITE_TOKEN=
```

The daemon will log: `Telemetry disabled (LOGFIRE_MIMESIS_WRITE_TOKEN not set)`

## Verification

1. Start daemon: `pnpm serve`
2. Check log: `[TELEMETRY] Telemetry initialized for service: mimesis-daemon (local)`
3. View traces at [Logfire Dashboard](https://logfire-eu.pydantic.dev)
