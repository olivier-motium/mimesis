# Mimesis Documentation

Real-time monitoring dashboard for Claude Code sessions.

## Quick Links

| I want to... | Read this |
|--------------|-----------|
| Get started quickly | [Getting Started](getting-started.md) |
| Run in production | [Deployment Guide](operations/deployment.md) |
| Configure the app | [Configuration Reference](architecture/configuration-reference.md) |
| Understand the CLI | [CLI Reference](cli-reference.md) |
| Learn the architecture | [README](../README.md) |
| Contribute to the project | [Contributing Guide](contributing.md) |

---

## Documentation Map

### For New Contributors

| Document | Purpose |
|----------|---------|
| [Getting Started](getting-started.md) | Setup and first run |
| [README](../README.md) | Project overview and architecture |
| [CLAUDE.md](../CLAUDE.md) | Coding guidelines and conventions |
| [Contributing Guide](contributing.md) | How to contribute to the project |
| [Testing Guide](guides/testing.md) | Manual testing strategies |

### For Operators

| Document | Purpose |
|----------|---------|
| [Deployment Guide](operations/deployment.md) | Running as a service |
| [Configuration Reference](architecture/configuration-reference.md) | All configuration modules and tunables |
| [Environment Variables](operations/configuration.md) | Runtime environment variables |
| [CLI Reference](cli-reference.md) | Watcher flags and options |

### For Developers

| Document | Purpose |
|----------|---------|
| [Gateway Architecture](architecture/gateway.md) | WebSocket protocol and session management |
| [Gateway Protocol](api/gateway-protocol.md) | WebSocket message reference |
| [REST API Endpoints](api/endpoints.md) | HTTP endpoint reference |
| [Session Lifecycle](architecture/session-lifecycle.md) | Session states, compaction, work chains |
| [Fleet DB Schema](architecture/fleet-db.md) | SQLite persistence layer |
| [Configuration Reference](architecture/configuration-reference.md) | All config modules |
| [UI Components](ui-components.md) | React component hierarchy |
| [Daemon APIs](api/daemon-api.md) | Internal service documentation |
| [spec.md](../spec.md) | Log format specification and types |

### Specifications

Implementation specifications for Fleet Commander versions:

| Document | Version | Status |
|----------|---------|--------|
| [SPEC_6.md](../SPEC_6.md) | v5.1 | **Current Implementation** |
| [FLEET_CMD_SPEC_V5.md](../FLEET_CMD_SPEC_V5.md) | v5 | Design spec |
| [FLEET_CMD_SPEC_V3.md](../FLEET_CMD_SPEC_V3.md) | v3 | Historical |
| [FLEET_CMD_SPEC.md](../FLEET_CMD_SPEC.md) | v1 | Historical |

### Reference Documentation

| Guide | Description |
|-------|-------------|
| [Claude Code Toolkit](claude-code/README.md) | Commands, skills, and hooks for Claude Code |
| [PydanticAI Reference](PydanticAI/INDEX.md) | AI agent framework documentation |
| [Logfire Guide](Logfire_cleaned/Index.md) | Observability platform guide |

---

## Key Concepts

| Concept | Description | Location |
|---------|-------------|----------|
| **Session Watcher** | Monitors `~/.claude/projects/` for JSONL changes | [README](../README.md#daemon) |
| **Fleet Gateway** | WebSocket server for PTY sessions and real-time events (port 4452) | [Gateway Architecture](architecture/gateway.md) |
| **Session Lifecycle** | Session states, compaction, segment chains, work chains | [Session Lifecycle](architecture/session-lifecycle.md) |
| **File-Based Status** | Claude Code hooks write status to `.claude/status.md` for goal/summary | [Daemon API](api/daemon-api.md#file-based-status-system-status-watcherts-status-parserts) |
| **Fleet DB** | SQLite ledger for briefings, jobs, projects | [Fleet DB Schema](architecture/fleet-db.md) |

---

## Project Structure

```
mimesis/
├── packages/
│   ├── daemon/     # Node.js watcher + Gateway server
│   └── ui/         # React dashboard
├── docs/           # Extended documentation (you are here)
│   ├── architecture/     # System design (Gateway, Fleet DB)
│   ├── api/              # Internal API documentation
│   ├── guides/           # How-to guides
│   ├── operations/       # Deployment and configuration
│   ├── claude-code/      # Claude Code Toolkit (commands, skills, hooks)
│   ├── Logfire_cleaned/  # Logfire knowledge base
│   └── PydanticAI/       # PydanticAI knowledge base
└── *.md            # Root-level docs and specs
```

## Port Allocation

| Port | Service |
|------|---------|
| 4451 | REST API (Hono) |
| 4452 | Gateway WebSocket |
| 5173 | UI dev server |

---

## Getting Help

- Check [Testing Guide](guides/testing.md) for debugging strategies
- Review the [CLI Reference](cli-reference.md) for watcher options
- See [Configuration](operations/configuration.md) for all tunables
- See [Deployment](operations/deployment.md) for production setup
