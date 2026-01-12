---
source: https://code.claude.com/docs/en/headless
fetched: 2026-01-12
---

# Run Claude Code Programmatically

## Overview

The [Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) gives you the same tools, agent loop, and context management that power Claude Code. It's available as a CLI for scripts and CI/CD, or as [Python](https://platform.claude.com/docs/en/agent-sdk/python) and [TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript) packages for full programmatic control.

**Note:** The CLI was previously called "headless mode." The `-p` flag and all CLI options work the same way.

## Basic Usage

To run Claude Code programmatically from the CLI, pass `-p` with your prompt and any [CLI options](/docs/en/cli-reference):

```shellscript
claude -p "Find and fix the bug in auth.py" --allowedTools "Read,Edit,Bash"
```

Add the `-p` (or `--print`) flag to any `claude` command to run it non-interactively. All CLI options work with `-p`, including:

- `--continue` for continuing conversations
- `--allowedTools` for auto-approving tools
- `--output-format` for structured output

This example asks Claude a question about your codebase:

```shellscript
claude -p "What does the auth module do?"
```

## Examples

### Get Structured Output

Use `--output-format` to control how responses are returned:

- `text` (default): plain text output
- `json`: structured JSON with result, session ID, and metadata
- `stream-json`: newline-delimited JSON for real-time streaming

Example returning a project summary as JSON:

```shellscript
claude -p "Summarize this project" --output-format json
```

To get output conforming to a specific schema, use `--output-format json` with `--json-schema` and a [JSON Schema](https://json-schema.org/) definition:

```shellscript
claude -p "Extract the main function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}'
```

Use tools like [jq](https://jqlang.github.io/jq/) to parse responses:

```shellscript
# Extract the text result
claude -p "Summarize this project" --output-format json | jq -r '.result'

# Extract structured output
claude -p "Extract function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}' \
  | jq '.structured_output'
```

### Auto-approve Tools

Use `--allowedTools` to let Claude use certain tools without prompting:

```shellscript
claude -p "Run the test suite and fix any failures" \
  --allowedTools "Bash,Read,Edit"
```

### Create a Commit

```shellscript
claude -p "Look at my staged changes and create an appropriate commit" \
  --allowedTools "Bash(git diff:*),Bash(git log:*),Bash(git status:*),Bash(git commit:*)"
```

**Note:** Slash commands like `/commit` are only available in interactive mode. In `-p` mode, describe the task you want to accomplish instead.

### Customize the System Prompt

Use `--append-system-prompt` to add instructions while keeping Claude Code's default behavior:

```shellscript
gh pr diff "$1" | claude -p \
  --append-system-prompt "You are a security engineer. Review for vulnerabilities." \
  --output-format json
```

See [system prompt flags](/docs/en/cli-reference#system-prompt-flags) for more options including `--system-prompt` to fully replace the default prompt.

### Continue Conversations

Use `--continue` to continue the most recent conversation, or `--resume` with a session ID for a specific conversation:

```shellscript
# First request
claude -p "Review this codebase for performance issues"

# Continue the most recent conversation
claude -p "Now focus on the database queries" --continue
claude -p "Generate a summary of all issues found" --continue
```

To resume a specific conversation, capture the session ID:

```shellscript
session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"
```

## Next Steps

- **Agent SDK quickstart**: Build your first agent with Python or TypeScript
- **CLI reference**: Explore all CLI flags and options
- **GitHub Actions**: Use the Agent SDK in GitHub workflows
- **GitLab CI/CD**: Use the Agent SDK in GitLab pipelines
