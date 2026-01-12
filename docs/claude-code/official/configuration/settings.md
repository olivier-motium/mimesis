---
source: https://code.claude.com/docs/en/settings
fetched: 2026-01-12
---

# Claude Code Settings

Claude Code offers a variety of settings to configure its behavior to meet your needs. You can configure Claude Code by running the `/config` command when using the interactive REPL, which opens a tabbed Settings interface where you can view status information and modify configuration options.

## Configuration Scopes

Claude Code uses a scope system to determine where configurations apply and who they're shared with. Understanding scopes helps you decide how to configure Claude Code for personal use, team collaboration, or enterprise deployment.

### Available Scopes

| Scope | Location | Who it affects | Shared with team? |
|---|---|---|---|
| Managed | System-level managed-settings.json | All users on the machine | Yes (deployed by IT) |
| User | ~/.claude/ directory | You, across all projects | No |
| Project | .claude/ in repository | All collaborators on this repository | Yes (committed to git) |
| Local | .claude/*.local.* files | You, in this repository only | No (gitignored) |

### When to Use Each Scope

**Managed scope** is for:
- Security policies that must be enforced organization-wide
- Compliance requirements that can't be overridden
- Standardized configurations deployed by IT/DevOps

**User scope** is best for:
- Personal preferences you want everywhere (themes, editor settings)
- Tools and plugins you use across all projects
- API keys and authentication (stored securely)

**Project scope** is best for:
- Team-shared settings (permissions, hooks, MCP servers)
- Plugins the whole team should have
- Standardizing tooling across collaborators

**Local scope** is best for:
- Personal overrides for a specific project
- Testing configurations before sharing with the team
- Machine-specific settings that won't work for others

### How Scopes Interact

When the same setting is configured in multiple scopes, more specific scopes take precedence:

1. **Managed (highest)** - can't be overridden by anything
2. **Command line arguments** - temporary session overrides
3. **Local** - overrides project and user settings
4. **Project** - overrides user settings
5. **User (lowest)** - applies when nothing else specifies the setting

For example, if a permission is allowed in user settings but denied in project settings, the project setting takes precedence and the permission is blocked.

### What Uses Scopes

Scopes apply to many Claude Code features:

| Feature | User location | Project location | Local location |
|---|---|---|---|
| Settings | ~/.claude/settings.json | .claude/settings.json | .claude/settings.local.json |
| Subagents | ~/.claude/agents/ | .claude/agents/ | — |
| MCP servers | ~/.claude.json | .mcp.json | ~/.claude.json (per-project) |
| Plugins | ~/.claude/settings.json | .claude/settings.json | .claude/settings.local.json |
| CLAUDE.md | ~/.claude/CLAUDE.md | CLAUDE.md or .claude/CLAUDE.md | CLAUDE.local.md |

## Settings Files

The `settings.json` file is our official mechanism for configuring Claude Code through hierarchical settings:

- **User settings** are defined in `~/.claude/settings.json` and apply to all projects.
- **Project settings** are saved in your project directory:
  - `.claude/settings.json` for settings that are checked into source control and shared with your team
  - `.claude/settings.local.json` for settings that are not checked in, useful for personal preferences and experimentation. Claude Code will configure git to ignore `.claude/settings.local.json` when it is created.
- **Managed settings**: For organizations that need centralized control, Claude Code supports `managed-settings.json` and `managed-mcp.json` files that can be deployed to system directories:
  - macOS: `/Library/Application Support/ClaudeCode/`
  - Linux and WSL: `/etc/claude-code/`
  - Windows: `C:\Program Files\ClaudeCode\`

These are system-wide paths (not user home directories like ~/Library/...) that require administrator privileges. They are designed to be deployed by IT administrators.

Other configuration is stored in `~/.claude.json`. This file contains your preferences (theme, notification settings, editor mode), OAuth session, MCP server configurations for user and local scopes, per-project state (allowed tools, trust settings), and various caches.

Project-scoped MCP servers are stored separately in `.mcp.json`.

### Example settings.json

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run test:*)",
      "Read(~/.zshrc)"
    ],
    "deny": [
      "Bash(curl:*)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  },
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp"
  },
  "companyAnnouncements": [
    "Welcome to Acme Corp! Review our code guidelines at docs.acme.com",
    "Reminder: Code reviews required for all PRs",
    "New security policy in effect"
  ]
}
```

## Available Settings

`settings.json` supports a number of options:

| Key | Description | Example |
|---|---|---|
| apiKeyHelper | Custom script, to be executed in /bin/sh, to generate an auth value. This value will be sent as X-Api-Key and Authorization: Bearer headers for model requests | `/bin/generate_temp_api_key.sh` |
| cleanupPeriodDays | Sessions inactive for longer than this period are deleted at startup. Setting to 0 immediately deletes all sessions. (default: 30 days) | `20` |
| companyAnnouncements | Announcement to display to users at startup. If multiple announcements are provided, they will be cycled through at random. | `["Welcome to Acme Corp! Review our code guidelines at docs.acme.com"]` |
| env | Environment variables that will be applied to every session | `{"FOO": "bar"}` |
| attribution | Customize attribution for git commits and pull requests. See Attribution settings | `{"commit": "🤖 Generated with Claude Code", "pr": ""}` |
| includeCoAuthoredBy | Deprecated: Use attribution instead. Whether to include the co-authored-by Claude byline in git commits and pull requests (default: true) | `false` |
| permissions | See table below for structure of permissions. | |
| hooks | Configure custom commands to run before or after tool executions. See hooks documentation | `{"PreToolUse": {"Bash": "echo 'Running command...'"}}` |
| disableAllHooks | Disable all hooks | `true` |
| allowManagedHooksOnly | (Managed settings only) Prevent loading of user, project, and plugin hooks. Only allows managed hooks and SDK hooks. | `true` |
| model | Override the default model to use for Claude Code | `"claude-sonnet-4-5-20250929"` |
| otelHeadersHelper | Script to generate dynamic OpenTelemetry headers. Runs at startup and periodically | `/bin/generate_otel_headers.sh` |
| statusLine | Configure a custom status line to display context. See statusLine documentation | `{"type": "command", "command": "~/.claude/statusline.sh"}` |
| fileSuggestion | Configure a custom script for @ file autocomplete. See File suggestion settings | `{"type": "command", "command": "~/.claude/file-suggestion.sh"}` |
| respectGitignore | Control whether the @ file picker respects .gitignore patterns. When true (default), files matching .gitignore patterns are excluded from suggestions | `false` |
| outputStyle | Configure an output style to adjust the system prompt. See output styles documentation | `"Explanatory"` |
| forceLoginMethod | Use claudeai to restrict login to Claude.ai accounts, console to restrict login to Claude Console (API usage billing) accounts | `claudeai` |
| forceLoginOrgUUID | Specify the UUID of an organization to automatically select it during login, bypassing the organization selection step. Requires forceLoginMethod to be set | `"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"` |
| enableAllProjectMcpServers | Automatically approve all MCP servers defined in project .mcp.json files | `true` |
| enabledMcpjsonServers | List of specific MCP servers from .mcp.json files to approve | `["memory", "github"]` |
| disabledMcpjsonServers | List of specific MCP servers from .mcp.json files to reject | `["filesystem"]` |
| allowedMcpServers | When set in managed-settings.json, allowlist of MCP servers users can configure. Undefined = no restrictions, empty array = lockdown. Applies to all scopes. Denylist takes precedence. | `[{ "serverName": "github" }]` |
| deniedMcpServers | When set in managed-settings.json, denylist of MCP servers that are explicitly blocked. Applies to all scopes including managed servers. Denylist takes precedence over allowlist. | `[{ "serverName": "filesystem" }]` |
| strictKnownMarketplaces | When set in managed-settings.json, allowlist of plugin marketplaces users can add. Undefined = no restrictions, empty array = lockdown. Applies to marketplace additions only. | `[{ "source": "github", "repo": "acme-corp/plugins" }]` |
| awsAuthRefresh | Custom script that modifies the .aws directory | `aws sso login --profile myprofile` |
| awsCredentialExport | Custom script that outputs JSON with AWS credentials | `/bin/generate_aws_grant.sh` |
| alwaysThinkingEnabled | Enable extended thinking by default for all sessions. Typically configured via the /config command rather than editing directly | `true` |
| language | Configure Claude's preferred response language (e.g., "japanese", "spanish", "french"). Claude will respond in this language by default | `"japanese"` |

## Permission Settings

| Keys | Description | Example |
|---|---|---|
| allow | Array of permission rules to allow tool use. Note: Bash rules use prefix matching, not regex | `[ "Bash(git diff:*)" ]` |
| ask | Array of permission rules to ask for confirmation upon tool use. | `[ "Bash(git push:*)" ]` |
| deny | Array of permission rules to deny tool use. Use this to also exclude sensitive files from Claude Code access. Note: Bash patterns are prefix matches and can be bypassed | `[ "WebFetch", "Bash(curl:*)", "Read(./.env)", "Read(./secrets/**)" ]` |
| additionalDirectories | Additional working directories that Claude has access to | `[ "../docs/" ]` |
| defaultMode | Default permission mode when opening Claude Code | `"acceptEdits"` |
| disableBypassPermissionsMode | Set to "disable" to prevent bypassPermissions mode from being activated. This disables the --dangerously-skip-permissions command-line flag. | `"disable"` |

## Sandbox Settings

Configure advanced sandboxing behavior. Sandboxing isolates bash commands from your filesystem and network.

| Keys | Description | Example |
|---|---|---|
| enabled | Enable bash sandboxing (macOS/Linux only). Default: false | `true` |
| autoAllowBashIfSandboxed | Auto-approve bash commands when sandboxed. Default: true | `true` |
| excludedCommands | Commands that should run outside of the sandbox | `["git", "docker"]` |
| allowUnsandboxedCommands | Allow commands to run outside the sandbox via the dangerouslyDisableSandbox parameter. When set to false, the dangerouslyDisableSandbox escape hatch is completely disabled and all commands must run sandboxed (or be in excludedCommands). Useful for enterprise policies that require strict sandboxing. Default: true | `false` |
| network.allowUnixSockets | Unix socket paths accessible in sandbox (for SSH agents, etc.) | `["~/.ssh/agent-socket"]` |
| network.allowLocalBinding | Allow binding to localhost ports (macOS only). Default: false | `true` |
| network.httpProxyPort | HTTP proxy port used if you wish to bring your own proxy. If not specified, Claude will run its own proxy. | `8080` |
| network.socksProxyPort | SOCKS5 proxy port used if you wish to bring your own proxy. If not specified, Claude will run its own proxy. | `8081` |
| enableWeakerNestedSandbox | Enable weaker sandbox for unprivileged Docker environments (Linux only). Reduces security. Default: false | `true` |

Configuration example:

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker"],
    "network": {
      "allowUnixSockets": [
        "/var/run/docker.sock"
      ],
      "allowLocalBinding": true
    }
  },
  "permissions": {
    "deny": [
      "Read(.envrc)",
      "Read(~/.aws/**)"
    ]
  }
}
```

Filesystem and network restrictions use standard permission rules:
- Use Read deny rules to block Claude from reading specific files or directories
- Use Edit allow rules to let Claude write to directories beyond the current working directory
- Use Edit deny rules to block writes to specific paths
- Use WebFetch allow/deny rules to control which network domains Claude can access

## Attribution Settings

Claude Code adds attribution to git commits and pull requests. These are configured separately:
- Commits use git trailers (like Co-Authored-By) by default, which can be customized or disabled
- Pull request descriptions are plain text

| Keys | Description |
|---|---|
| commit | Attribution for git commits, including any trailers. Empty string hides commit attribution |
| pr | Attribution for pull request descriptions. Empty string hides pull request attribution |

Default commit attribution:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

Default pull request attribution:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Example:
```json
{
  "attribution": {
    "commit": "Generated with AI\n\nCo-Authored-By: AI <ai@example.com>",
    "pr": ""
  }
}
```

The attribution setting takes precedence over the deprecated includeCoAuthoredBy setting. To hide all attribution, set commit and pr to empty strings.

## File Suggestion Settings

Configure a custom command for @ file path autocomplete. The built-in file suggestion uses fast filesystem traversal, but large monorepos may benefit from project-specific indexing such as a pre-built file index or custom tooling.

```json
{
  "fileSuggestion": {
    "type": "command",
    "command": "~/.claude/file-suggestion.sh"
  }
}
```

The command runs with the same environment variables as hooks, including CLAUDE_PROJECT_DIR. It receives JSON via stdin with a query field:

```json
{"query": "src/comp"}
```

Output newline-separated file paths to stdout (currently limited to 15):

```
src/components/Button.tsx
src/components/Modal.tsx
src/components/Form.tsx
```

Example:

```bash
#!/bin/bash
query=$(cat | jq -r '.query')
your-repo-file-index --query "$query" | head -20
```

## Hook Configuration

**Managed settings only:** Controls which hooks are allowed to run. This setting can only be configured in managed settings and provides administrators with strict control over hook execution.

Behavior when `allowManagedHooksOnly` is true:
- Managed hooks and SDK hooks are loaded
- User hooks, project hooks, and plugin hooks are blocked

Configuration:

```json
{
  "allowManagedHooksOnly": true
}
```

## Settings Precedence

Settings apply in order of precedence. From highest to lowest:

1. **Managed settings** (managed-settings.json) - Policies deployed by IT/DevOps to system directories. Cannot be overridden by user or project settings
2. **Command line arguments** - Temporary overrides for a specific session
3. **Local project settings** (.claude/settings.local.json) - Personal project-specific settings
4. **Shared project settings** (.claude/settings.json) - Team-shared project settings in source control
5. **User settings** (~/.claude/settings.json) - Personal global settings

This hierarchy ensures that organizational policies are always enforced while still allowing teams and individuals to customize their experience. For example, if your user settings allow `Bash(npm run:*)` but a project's shared settings deny it, the project setting takes precedence and the command is blocked.

## Key Points About the Configuration System

- **Memory files (CLAUDE.md)**: Contain instructions and context that Claude loads at startup
- **Settings files (JSON)**: Configure permissions, environment variables, and tool behavior
- **Slash commands**: Custom commands that can be invoked during a session with /command-name
- **MCP servers**: Extend Claude Code with additional tools and integrations
- **Precedence**: Higher-level configurations (Managed) override lower-level ones (User/Project)
- **Inheritance**: Settings are merged, with more specific settings adding to or overriding broader ones

## System Prompt

Claude Code's internal system prompt is not published. To add custom instructions, use CLAUDE.md files or the `--append-system-prompt` flag.

## Excluding Sensitive Files

To prevent Claude Code from accessing files containing sensitive information like API keys, secrets, and environment files, use the `permissions.deny` setting in your `.claude/settings.json` file:

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./config/credentials.json)",
      "Read(./build)"
    ]
  }
}
```

This replaces the deprecated ignorePatterns configuration. Files matching these patterns will be completely invisible to Claude Code, preventing any accidental exposure of sensitive data.

## Subagent Configuration

Claude Code supports custom AI subagents that can be configured at both user and project levels. These subagents are stored as Markdown files with YAML frontmatter:

- **User subagents**: `~/.claude/agents/` - Available across all your projects
- **Project subagents**: `.claude/agents/` - Specific to your project and can be shared with your team

Subagent files define specialized AI assistants with custom prompts and tool permissions. Learn more about creating and using subagents in the subagents documentation.

## Plugin Configuration

Claude Code supports a plugin system that lets you extend functionality with custom commands, agents, hooks, and MCP servers. Plugins are distributed through marketplaces and can be configured at both user and repository levels.

### Plugin Settings

Plugin-related settings in settings.json:

```json
{
  "enabledPlugins": {
    "formatter@acme-tools": true,
    "deployer@acme-tools": true,
    "analyzer@security-plugins": false
  },
  "extraKnownMarketplaces": {
    "acme-tools": {
      "source": "github",
      "repo": "acme-corp/claude-plugins"
    }
  }
}
```

### enabledPlugins

Controls which plugins are enabled. Format: `"plugin-name@marketplace-name": true/false`

**Scopes:**
- User settings (~/.claude/settings.json): Personal plugin preferences
- Project settings (.claude/settings.json): Project-specific plugins shared with team
- Local settings (.claude/settings.local.json): Per-machine overrides (not committed)

Example:

```json
{
  "enabledPlugins": {
    "code-formatter@team-tools": true,
    "deployment-tools@team-tools": true,
    "experimental-features@personal": false
  }
}
```

### extraKnownMarketplaces

Defines additional marketplaces that should be made available for the repository. Typically used in repository-level settings to ensure team members have access to required plugin sources.

When a repository includes extraKnownMarketplaces:
- Team members are prompted to install the marketplace when they trust the folder
- Team members are then prompted to install plugins from that marketplace
- Users can skip unwanted marketplaces or plugins (stored in user settings)
- Installation respects trust boundaries and requires explicit consent

Example:

```json
{
  "extraKnownMarketplaces": {
    "acme-tools": {
      "source": {
        "source": "github",
        "repo": "acme-corp/claude-plugins"
      }
    },
    "security-plugins": {
      "source": {
        "source": "git",
        "url": "https://git.example.com/security/plugins.git"
      }
    }
  }
}
```

Marketplace source types:
- **github**: GitHub repository (uses repo)
- **git**: Any git URL (uses url)
- **directory**: Local filesystem path (uses path, for development only)

### Managing Plugins

Use the `/plugin` command to manage plugins interactively:
- Browse available plugins from marketplaces
- Install/uninstall plugins
- Enable/disable plugins
- View plugin details (commands, agents, hooks provided)
- Add/remove marketplaces

Learn more about the plugin system in the plugins documentation.

## Environment Variables

Claude Code supports numerous environment variables to control its behavior. All environment variables can also be configured in settings.json.

Key environment variables include:

| Variable | Purpose |
|---|---|
| ANTHROPIC_API_KEY | API key sent as X-Api-Key header |
| ANTHROPIC_MODEL | Name of the model setting to use |
| CLAUDE_CODE_USE_BEDROCK | Use Bedrock |
| CLAUDE_CODE_USE_VERTEX | Use Vertex |
| CLAUDE_CODE_USE_FOUNDRY | Use Microsoft Foundry |
| DISABLE_TELEMETRY | Set to 1 to opt out of Statsig telemetry |
| DISABLE_ERROR_REPORTING | Set to 1 to opt out of Sentry error reporting |
| MAX_THINKING_TOKENS | Enable extended thinking and set the token budget |
| HTTP_PROXY | Specify HTTP proxy server for network connections |
| HTTPS_PROXY | Specify HTTPS proxy server for network connections |

## Tools Available to Claude

Claude Code has access to a set of powerful tools:

| Tool | Description | Permission Required |
|---|---|---|
| AskUserQuestion | Asks the user multiple choice questions | No |
| Bash | Executes shell commands in your environment | Yes |
| BashOutput | Retrieves output from a background bash shell | No |
| Edit | Makes targeted edits to specific files | Yes |
| ExitPlanMode | Prompts the user to exit plan mode | Yes |
| Glob | Finds files based on pattern matching | No |
| Grep | Searches for patterns in file contents | No |
| KillShell | Kills a running background bash shell | No |
| NotebookEdit | Modifies Jupyter notebook cells | Yes |
| Read | Reads the contents of files | No |
| Skill | Executes a skill or slash command | Yes |
| Task | Runs a sub-agent to handle complex tasks | No |
| TodoWrite | Creates and manages structured task lists | No |
| WebFetch | Fetches content from a specified URL | Yes |
| WebSearch | Performs web searches with domain filtering | Yes |
| Write | Creates or overwrites files | Yes |

Permission rules can be configured using `/allowed-tools` or in permission settings.

## See Also

- Identity and Access Management - Learn about Claude Code's permission system
- IAM and access control - Managed policy configuration
- Troubleshooting - Solutions for common configuration issues
