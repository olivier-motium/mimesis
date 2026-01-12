---
source: https://code.claude.com/docs/en/memory
fetched: 2026-01-12
---

# Manage Claude's Memory

Claude Code can remember your preferences across sessions, like style guidelines and common commands in your workflow.

## Determine Memory Type

Claude Code offers four memory locations in a hierarchical structure:

| Memory Type | Location | Purpose | Use Case Examples | Shared With |
|---|---|---|---|---|
| **Enterprise policy** | • macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`<br>• Linux: `/etc/claude-code/CLAUDE.md`<br>• Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | Organization-wide instructions managed by IT/DevOps | Company coding standards, security policies, compliance requirements | All users in organization |
| **Project memory** | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team-shared instructions for the project | Project architecture, coding standards, common workflows | Team members via source control |
| **Project rules** | `./.claude/rules/*.md` | Modular, topic-specific project instructions | Language-specific guidelines, testing conventions, API standards | Team members via source control |
| **User memory** | `~/.claude/CLAUDE.md` | Personal preferences for all projects | Code styling preferences, personal tooling shortcuts | Just you (all projects) |
| **Project memory (local)** | `./CLAUDE.local.md` | Personal project-specific preferences | Your sandbox URLs, preferred test data | Just you (current project) |

> **Note:** CLAUDE.local.md files are automatically added to .gitignore, making them ideal for private project-specific preferences that shouldn't be checked into version control.

## CLAUDE.md Imports

CLAUDE.md files can import additional files using `@path/to/import` syntax:

```
See @README for project overview and @package.json for available npm commands for this project.

# Additional Instructions
- git workflow @docs/git-instructions.md
```

Both relative and absolute paths are allowed. Imported files can recursively import additional files, with a max-depth of 5 hops. View loaded memory files with the `/memory` command.

## How Claude Looks Up Memories

Claude Code reads memories recursively, starting in the current working directory and recursing up to (but not including) the root directory. It will also discover CLAUDE.md nested in subtrees under your current working directory.

## Directly Edit Memories

Use the `/memory` slash command during a session to open any memory file in your system editor for more extensive additions or organization.

## Set Up Project Memory

Bootstrap a CLAUDE.md for your codebase with:

```
> /init
```

**Tips:**
- Include frequently used commands (build, test, lint)
- Document code style preferences and naming conventions
- Add important architectural patterns specific to your project

## Modular Rules with `.claude/rules/`

For larger projects, organize instructions into multiple files using the `.claude/rules/` directory.

### Basic Structure

```
your-project/
├── .claude/
│   ├── CLAUDE.md # Main project instructions
│   └── rules/
│       ├── code-style.md # Code style guidelines
│       ├── testing.md # Testing conventions
│       └── security.md # Security requirements
```

### Path-Specific Rules

Rules can be scoped to specific files using YAML frontmatter with the `paths` field:

```yaml
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules

- All API endpoints must include input validation
- Use the standard error response format
- Include OpenAPI documentation comments
```

### Glob Patterns

| Pattern | Matches |
|---|---|
| `**/*.ts` | All TypeScript files in any directory |
| `src/**/*` | All files under `src/` directory |
| `*.md` | Markdown files in the project root |
| `src/components/*.tsx` | React components in a specific directory |

Brace expansion is supported:

```yaml
---
paths:
  - "src/**/*.{ts,tsx}"
  - "{src,lib}/**/*.ts"
---

# TypeScript/React Rules
```

### Subdirectories

```
.claude/rules/
├── frontend/
│   ├── react.md
│   └── styles.md
├── backend/
│   ├── api.md
│   └── database.md
└── general.md
```

### Symlinks

The `.claude/rules/` directory supports symlinks for sharing rules across projects:

```bash
# Symlink a shared rules directory
ln -s ~/shared-claude-rules .claude/rules/shared

# Symlink individual rule files
ln -s ~/company-standards/security.md .claude/rules/security.md
```

### User-Level Rules

Create personal rules in `~/.claude/rules/`:

```
~/.claude/rules/
├── preferences.md # Your personal coding preferences
└── workflows.md # Your preferred workflows
```

**Best practices for `.claude/rules/`:**
- **Keep rules focused**: Each file should cover one topic
- **Use descriptive filenames**: Indicate what the rules cover
- **Use conditional rules sparingly**: Only add `paths` when necessary
- **Organize with subdirectories**: Group related rules

## Organization-Level Memory Management

Organizations can deploy centrally managed CLAUDE.md files to all users:

1. Create the managed memory file at the **Managed policy** location (system-level paths shown above)
2. Deploy via configuration management system (MDM, Group Policy, Ansible, etc.)

## Memory Best Practices

- **Be specific**: "Use 2-space indentation" is better than "Format code properly"
- **Use structure to organize**: Format each memory as a bullet point and group under descriptive headings
- **Review periodically**: Update memories as your project evolves to ensure Claude uses current information
