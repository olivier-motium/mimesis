# Documentation Index

Welcome to the Claude Code Session Tracker documentation.

## Quick Start

```bash
pnpm install
export ANTHROPIC_API_KEY=sk-ant-...
pnpm start  # Starts daemon + UI
```

Open http://localhost:5173 to view the dashboard.

---

## Documentation Map

### For New Contributors

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Project overview and architecture |
| [CLAUDE.md](../CLAUDE.md) | Coding guidelines and conventions |
| [UI Components](./ui-components.md) | React component hierarchy |

### For Operators

| Document | Purpose |
|----------|---------|
| [Deployment Guide](./deployment.md) | Running as a service, environment setup |
| [CLI Reference](./cli-reference.md) | Watcher flags and options |
| [Testing Guide](../TESTING.md) | Manual testing strategies |

### For API Consumers

| Document | Purpose |
|----------|---------|
| [Summarizer Service](./summarizer.md) | AI summarization API |
| [spec.md](../spec.md) | Log format specification and types |

---

## Key Concepts

| Concept | Description | Location |
|---------|-------------|----------|
| **Session Watcher** | Monitors `~/.claude/projects/` for JSONL changes | [README](../README.md#daemon) |
| **Status Machine** | XState state machine for session status | [README](../README.md#session-status-state-machine) |
| **Durable Streams** | Real-time state sync between daemon and UI | [CLAUDE.md](../CLAUDE.md#durable-streams-integration) |
| **AI Summaries** | Claude-generated goals and activity summaries | [Summarizer](./summarizer.md) |

---

## Project Structure

```
claude-code-ui/
├── packages/
│   ├── daemon/     # Node.js file watcher + stream server
│   └── ui/         # React dashboard
├── docs/           # Extended documentation (you are here)
└── *.md            # Root-level docs
```

---

## Getting Help

- Check [TESTING.md](../TESTING.md) for debugging strategies
- Review the [CLI Reference](./cli-reference.md) for watcher options
- See [Deployment](./deployment.md) for production setup
