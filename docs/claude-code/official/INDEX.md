# Claude Code Official Documentation

> Local mirror of official documentation from [code.claude.com](https://code.claude.com/docs)
>
> Fetched: 2026-01-12

This directory contains a structured copy of the official Claude Code documentation for offline reference.

---

## Quick Links

| I want to... | Read this |
|--------------|-----------|
| Set up keyboard shortcuts | [Terminal Config](interactive/terminal-config.md) |
| Learn vim mode | [Interactive Mode](interactive/interactive-mode.md) |
| Run Claude headless in CI | [Headless](headless/headless.md) |
| See all CLI flags | [CLI Reference](headless/cli-reference.md) |
| Configure settings | [Settings](configuration/settings.md) |
| Create custom hooks | [Hooks Guide](hooks/hooks-guide.md) |
| Build a custom subagent | [Subagents](subagents/sub-agents.md) |
| Create a Skill | [Skills](skills-memory/skills.md) |

---

## Documentation Index

### Interactive Mode
Documentation for using Claude Code interactively in the terminal.

| Document | Description |
|----------|-------------|
| [Interactive Mode](interactive/interactive-mode.md) | Keyboard shortcuts, vim mode, command history, bash mode |
| [Terminal Config](interactive/terminal-config.md) | Terminal setup, themes, Shift+Enter binding, notifications |

### Hooks System
Create hooks that run automatically during Claude Code's lifecycle.

| Document | Description |
|----------|-------------|
| [Hooks Guide](hooks/hooks-guide.md) | Quickstart and examples for creating hooks |
| [Hooks Reference](hooks/hooks-reference.md) | Complete event reference, input/output schemas, security |

### Headless / Programmatic Usage
Run Claude Code non-interactively for automation and CI/CD.

| Document | Description |
|----------|-------------|
| [Headless](headless/headless.md) | `-p` flag, output formats, `--json-schema`, tool approval |
| [CLI Reference](headless/cli-reference.md) | Complete CLI flags reference, `--agents` format |
| [Common Workflows](headless/common-workflows.md) | Codebase exploration, bug fixing, refactoring, PRs |

### Configuration
Settings and model configuration.

| Document | Description |
|----------|-------------|
| [Settings](configuration/settings.md) | Settings scopes, permissions, sandbox, environment variables |
| [Model Config](configuration/model-config.md) | Model aliases (sonnet, opus, haiku), environment variables |

### Skills & Memory
Teach Claude reusable capabilities and manage project memory.

| Document | Description |
|----------|-------------|
| [Skills](skills-memory/skills.md) | Create, configure, and distribute Agent Skills |
| [Memory](skills-memory/memory.md) | CLAUDE.md hierarchy, `.claude/rules/`, memory imports |

### Subagents
Create specialized AI assistants for specific tasks.

| Document | Description |
|----------|-------------|
| [Subagents](subagents/sub-agents.md) | Built-in agents, custom subagents, hooks, tool restrictions |

### Extensions
Extend Claude Code with plugins, commands, and IDE integrations.

| Document | Description |
|----------|-------------|
| [Slash Commands](extensions/slash-commands.md) | Built-in commands, custom commands, MCP commands |
| [Plugins](extensions/plugins.md) | Create and distribute plugins with commands, agents, hooks |
| [VS Code](extensions/vs-code.md) | VS Code extension setup, commands, configuration |

### Security
Security features, sandboxing, and monitoring.

| Document | Description |
|----------|-------------|
| [Sandboxing](security/sandboxing.md) | Filesystem/network isolation, OS-level enforcement |
| [Security](security/security.md) | Permission model, prompt injection protection, best practices |
| [Monitoring](security/monitoring-usage.md) | OpenTelemetry metrics, events, cost tracking |

---

## Directory Structure

```
docs/claude-code/official/
├── INDEX.md                      # This file
├── interactive/
│   ├── interactive-mode.md       # Keyboard shortcuts, vim mode
│   └── terminal-config.md        # Terminal setup, themes
├── hooks/
│   ├── hooks-guide.md            # Getting started with hooks
│   └── hooks-reference.md        # Complete hooks reference
├── headless/
│   ├── headless.md               # Headless/SDK usage
│   ├── cli-reference.md          # CLI flags reference
│   └── common-workflows.md       # Workflow patterns
├── configuration/
│   ├── settings.md               # Settings reference
│   └── model-config.md           # Model configuration
├── skills-memory/
│   ├── skills.md                 # Agent Skills
│   └── memory.md                 # Memory management
├── subagents/
│   └── sub-agents.md             # Custom subagents
├── extensions/
│   ├── slash-commands.md         # Slash commands
│   ├── plugins.md                # Plugin development
│   └── vs-code.md                # VS Code integration
└── security/
    ├── sandboxing.md             # Sandboxing features
    ├── security.md               # Security overview
    └── monitoring-usage.md       # Monitoring & telemetry
```

---

## Source Attribution

All documentation in this directory is sourced from [code.claude.com/docs](https://code.claude.com/docs).

Each file includes a frontmatter block with the original source URL:

```yaml
---
source: https://code.claude.com/docs/en/<page>
fetched: 2026-01-12
---
```

For the most up-to-date documentation, always refer to the official source.
