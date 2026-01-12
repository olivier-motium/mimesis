---
source: https://code.claude.com/docs/en/common-workflows
fetched: 2026-01-12
---

# Common Workflows

Each task in this document includes clear instructions, example commands, and best practices to help you get the most from Claude Code.

## Understand New Codebases

### Get a Quick Codebase Overview

Suppose you've just joined a new project and need to understand its structure quickly.

1. **Navigate to the project root directory**
   ```bash
   cd /path/to/project
   ```

2. **Start Claude Code**
   ```bash
   claude
   ```

3. **Ask for a high-level overview**
   ```
   > give me an overview of this codebase
   ```

4. **Dive deeper into specific components**
   ```
   > explain the main architecture patterns used here
   > what are the key data models?
   > how is authentication handled?
   ```

**Tips:**
- Start with broad questions, then narrow down to specific areas
- Ask about coding conventions and patterns used in the project
- Request a glossary of project-specific terms

### Find Relevant Code

Suppose you need to locate code related to a specific feature or functionality.

1. **Ask Claude to find relevant files**
   ```
   > find the files that handle user authentication
   ```

2. **Get context on how components interact**
   ```
   > how do these authentication files work together?
   ```

3. **Understand the execution flow**
   ```
   > trace the login process from front-end to database
   ```

**Tips:**
- Be specific about what you're looking for
- Use domain language from the project

## Fix Bugs Efficiently

Suppose you've encountered an error message and need to find and fix its source.

1. **Share the error with Claude**
   ```
   > I'm seeing an error when I run npm test
   ```

2. **Ask for fix recommendations**
   ```
   > suggest a few ways to fix the @ts-ignore in user.ts
   ```

3. **Apply the fix**
   ```
   > update user.ts to add the null check you suggested
   ```

**Tips:**
- Tell Claude the command to reproduce the issue and get a stack trace
- Mention any steps to reproduce the error
- Let Claude know if the error is intermittent or consistent

## Refactor Code

Suppose you need to update old code to use modern patterns and practices.

1. **Identify legacy code for refactoring**
   ```
   > find deprecated API usage in our codebase
   ```

2. **Get refactoring recommendations**
   ```
   > suggest how to refactor utils.js to use modern JavaScript features
   ```

3. **Apply the changes safely**
   ```
   > refactor utils.js to use ES2024 features while maintaining the same behavior
   ```

4. **Verify the refactoring**
   ```
   > run tests for the refactored code
   ```

**Tips:**
- Ask Claude to explain the benefits of the modern approach
- Request that changes maintain backward compatibility when needed
- Do refactoring in small, testable increments

## Use Specialized Subagents

Suppose you want to use specialized AI subagents to handle specific tasks more effectively.

1. **View available subagents**
   ```
   > /agents
   ```
   This shows all available subagents and lets you create new ones.

2. **Use subagents automatically**
   Claude Code automatically delegates appropriate tasks to specialized subagents:
   ```
   > review my recent code changes for security issues
   > run all tests and fix any failures
   ```

3. **Explicitly request specific subagents**
   ```
   > use the code-reviewer subagent to check the auth module
   > have the debugger subagent investigate why users can't log in
   ```

4. **Create custom subagents for your workflow**
   ```
   > /agents
   ```
   Then select "Create New subagent" and follow the prompts to define:
   - A unique identifier that describes the subagent's purpose (for example, code-reviewer, api-designer).
   - When Claude should use this agent
   - Which tools it can access
   - A system prompt describing the agent's role and behavior

**Tips:**
- Create project-specific subagents in `.claude/agents/` for team sharing
- Use descriptive description fields to enable automatic delegation
- Limit tool access to what each subagent actually needs
- Check the subagents documentation for detailed examples

## Use Plan Mode for Safe Code Analysis

Plan Mode instructs Claude to create a plan by analyzing the codebase with read-only operations, perfect for exploring codebases, planning complex changes, or reviewing code safely.

### When to Use Plan Mode

- **Multi-step implementation**: When your feature requires making edits to many files
- **Code exploration**: When you want to research the codebase thoroughly before changing anything
- **Interactive development**: When you want to iterate on the direction with Claude

### How to Use Plan Mode

**Turn on Plan Mode during a session**

You can switch into Plan Mode during a session using `Shift+Tab` to cycle through permission modes. If you are in Normal Mode, Shift+Tab first switches into Auto-Accept Mode, indicated by `⏵⏵ accept edits on` at the bottom of the terminal. A subsequent Shift+Tab will switch into Plan Mode, indicated by `⏸ plan mode on`.

**Start a new session in Plan Mode**

To start a new session in Plan Mode, use the `--permission-mode plan` flag:

```bash
claude --permission-mode plan
```

**Run "headless" queries in Plan Mode**

You can also run a query in Plan Mode directly with `-p` (that is, in "headless mode"):

```bash
claude --permission-mode plan -p "Analyze the authentication system and suggest improvements"
```

### Example: Planning a Complex Refactor

```bash
claude --permission-mode plan
```

```
> I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Claude analyzes the current implementation and create a comprehensive plan. Refine with follow-ups:

```
> What about backward compatibility?
> How should we handle database migration?
```

### Configure Plan Mode as Default

```json
// .claude/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

See settings documentation for more configuration options.

## Work with Tests

Suppose you need to add tests for uncovered code.

1. **Identify untested code**
   ```
   > find functions in NotificationsService.swift that are not covered by tests
   ```

2. **Generate test scaffolding**
   ```
   > add tests for the notification service
   ```

3. **Add meaningful test cases**
   ```
   > add test cases for edge conditions in the notification service
   ```

4. **Run and verify tests**
   ```
   > run the new tests and fix any failures
   ```

Claude can generate tests that follow your project's existing patterns and conventions. When asking for tests, be specific about what behavior you want to verify. Claude examines your existing test files to match the style, frameworks, and assertion patterns already in use.

For comprehensive coverage, ask Claude to identify edge cases you might have missed. Claude can analyze your code paths and suggest tests for error conditions, boundary values, and unexpected inputs that are easy to overlook.

## Create Pull Requests

Suppose you need to create a well-documented pull request for your changes.

1. **Summarize your changes**
   ```
   > summarize the changes I've made to the authentication module
   ```

2. **Generate a pull request with Claude**
   ```
   > create a pr
   ```

3. **Review and refine**
   ```
   > enhance the PR description with more context about the security improvements
   ```

4. **Add testing details**
   ```
   > add information about how these changes were tested
   ```

**Tips:**
- Ask Claude directly to make a PR for you
- Review Claude's generated PR before submitting
- Ask Claude to highlight potential risks or considerations

## Handle Documentation

Suppose you need to add or update documentation for your code.

1. **Identify undocumented code**
   ```
   > find functions without proper JSDoc comments in the auth module
   ```

2. **Generate documentation**
   ```
   > add JSDoc comments to the undocumented functions in auth.js
   ```

3. **Review and enhance**
   ```
   > improve the generated documentation with more context and examples
   ```

4. **Verify documentation**
   ```
   > check if the documentation follows our project standards
   ```

**Tips:**
- Specify the documentation style you want (JSDoc, docstrings, etc.)
- Ask for examples in the documentation
- Request documentation for public APIs, interfaces, and complex logic

## Work with Images

Suppose you need to work with images in your codebase, and you want Claude's help analyzing image content.

1. **Add an image to the conversation**
   You can use any of these methods:
   - Drag and drop an image into the Claude Code window
   - Copy an image and paste it into the CLI with `ctrl+v` (Do not use cmd+v)
   - Provide an image path to Claude. E.g., "Analyze this image: /path/to/your/image.png"

2. **Ask Claude to analyze the image**
   ```
   > What does this image show?
   > Describe the UI elements in this screenshot
   > Are there any problematic elements in this diagram?
   ```

3. **Use images for context**
   ```
   > Here's a screenshot of the error. What's causing it?
   > This is our current database schema. How should we modify it for the new feature?
   ```

4. **Get code suggestions from visual content**
   ```
   > Generate CSS to match this design mockup
   > What HTML structure would recreate this component?
   ```

**Tips:**
- Use images when text descriptions would be unclear or cumbersome
- Include screenshots of errors, UI designs, or diagrams for better context
- You can work with multiple images in a conversation
- Image analysis works with diagrams, screenshots, mockups, and more
- When Claude references images (for example, [Image #1]), Cmd+Click (Mac) or Ctrl+Click (Windows/Linux) the link to open the image in your default viewer

## Reference Files and Directories

Use `@` to quickly include files or directories without waiting for Claude to read them.

1. **Reference a single file**
   ```
   > Explain the logic in @src/utils/auth.js
   ```
   This includes the full content of the file in the conversation.

2. **Reference a directory**
   ```
   > What's the structure of @src/components?
   ```
   This provides a directory listing with file information.

3. **Reference MCP resources**
   ```
   > Show me the data from @github:repos/owner/repo/issues
   ```
   This fetches data from connected MCP servers using the format `@server:resource`. See MCP resources for details.

**Tips:**
- File paths can be relative or absolute
- `@` file references add CLAUDE.md in the file's directory and parent directories to context
- Directory references show file listings, not contents
- You can reference multiple files in a single message (for example, "@file1.js and @file2.js")

## Use Extended Thinking (Thinking Mode)

Extended thinking reserves a portion of the total output token budget for Claude to reason through complex problems step-by-step. This reasoning is visible in verbose mode, which you can toggle on with `Ctrl+O`.

Extended thinking is particularly valuable for complex architectural decisions, challenging bugs, multi-step implementation planning, and evaluating tradeoffs between different approaches. It provides more space for exploring multiple solutions, analyzing edge cases, and self-correcting mistakes.

Sonnet 4.5 and Opus 4.5 have thinking enabled by default. All other models have thinking disabled by default. Use `/model` to view or switch your current model.

You can configure thinking mode for Claude Code in several ways:

| Scope | How to enable | Details |
|---|---|---|
| Toggle shortcut | Press Option+T (macOS) or Alt+T (Windows/Linux) | Toggle thinking on/off. May require terminal configuration to enable Option key shortcuts |
| Global default | Use `/config` to toggle thinking mode on | Sets your default across all projects. Saved as `alwaysThinkingEnabled` in `~/.claude/settings.json` |
| Environment variable override | Set `MAX_THINKING_TOKENS` environment variable | When set, applies a custom token budget to all requests, overriding your thinking mode configuration. Example: `export MAX_THINKING_TOKENS=1024` |

### Per-request Thinking with Ultrathink

You can include `ultrathink` as a keyword in your message to enable thinking for a single request:

```
> ultrathink: design a caching layer for our API
```

Note that ultrathink both allocates the thinking budget AND semantically signals to Claude to reason more thoroughly, which may result in deeper thinking than necessary for your task.

The ultrathink keyword only works when `MAX_THINKING_TOKENS` is not set. When `MAX_THINKING_TOKENS` is configured, it takes priority and controls the thinking budget for all requests.

Other phrases like "think", "think hard", and "think more" are interpreted as regular prompt instructions and don't allocate thinking tokens.

To view Claude's thinking process, press `Ctrl+O` to toggle verbose mode and see the internal reasoning displayed as gray italic text.

### How Extended Thinking Token Budgets Work

Extended thinking uses a token budget that controls how much internal reasoning Claude can perform before responding.

A larger thinking token budget provides:
- More space to explore multiple solution approaches step-by-step
- Room to analyze edge cases and evaluate tradeoffs thoroughly
- Ability to revise reasoning and self-correct mistakes

**Token budgets for thinking mode:**
- When thinking is enabled (via `/config` or ultrathink), Claude can use up to 31,999 tokens from your output budget for internal reasoning
- When thinking is disabled, Claude uses 0 tokens for thinking

**Custom token budgets:**
- You can set a custom thinking token budget using the `MAX_THINKING_TOKENS` environment variable
- This takes highest priority and overrides the default 31,999 token budget
- See the extended thinking documentation for valid token ranges

You're charged for all thinking tokens used, even though Claude 4 models show summarized thinking.

## Resume Previous Conversations

When starting Claude Code, you can resume a previous session:
- `claude --continue` continues the most recent conversation in the current directory
- `claude --resume` opens a conversation picker or resumes by name

From inside an active session, use `/resume` to switch to a different conversation.

Sessions are stored per project directory. The `/resume` picker shows sessions from the same git repository, including worktrees.

### Name Your Sessions

Give sessions descriptive names to find them later. This is a best practice when working on multiple tasks or features.

1. **Name the current session**
   Use `/rename` during a session to give it a memorable name:
   ```
   > /rename auth-refactor
   ```
   You can also rename any session from the picker: run `/resume`, navigate to a session, and press R.

2. **Resume by name later**
   From the command line:
   ```bash
   claude --resume auth-refactor
   ```
   Or from inside an active session:
   ```
   > /resume auth-refactor
   ```

### Use the Session Picker

The `/resume` command (or `claude --resume` without arguments) opens an interactive session picker with these features:

**Keyboard shortcuts in the picker:**

| Shortcut | Action |
|---|---|
| ↑ / ↓ | Navigate between sessions |
| → / ← | Expand or collapse grouped sessions |
| Enter | Select and resume the highlighted session |
| P | Preview the session content |
| R | Rename the highlighted session |
| / | Search to filter sessions |
| A | Toggle between current directory and all projects |
| B | Filter to sessions from your current git branch |
| Esc | Exit the picker or search mode |

**Session organization:**
The picker displays sessions with helpful metadata:
- Session name or initial prompt
- Time elapsed since last activity
- Message count
- Git branch (if applicable)

Forked sessions (created with `/rewind` or `--fork-session`) are grouped together under their root session, making it easier to find related conversations.

**Tips:**
- Name sessions early: Use `/rename` when starting work on a distinct task—it's much easier to find "payment-integration" than "explain this function" later
- Use `--continue` for quick access to your most recent conversation in the current directory
- Use `--resume session-name` when you know which session you need
- Use `--resume` (without a name) when you need to browse and select
- For scripts, use `claude --continue --print "prompt"` to resume in non-interactive mode
- Press P in the picker to preview a session before resuming it

**How it works:**
- **Conversation Storage:** All conversations are automatically saved locally with their full message history
- **Message Deserialization:** When resuming, the entire message history is restored to maintain context
- **Tool State:** Tool usage and results from the previous conversation are preserved
- **Context Restoration:** The conversation resumes with all previous context intact

## Run Parallel Claude Code Sessions with Git Worktrees

Suppose you need to work on multiple tasks simultaneously with complete code isolation between Claude Code instances.

1. **Understand Git worktrees**
   Git worktrees allow you to check out multiple branches from the same repository into separate directories. Each worktree has its own working directory with isolated files, while sharing the same Git history. Learn more in the official Git worktree documentation.

2. **Create a new worktree**
   ```bash
   # Create a new worktree with a new branch
   git worktree add ../project-feature-a -b feature-a

   # Or create a worktree with an existing branch
   git worktree add ../project-bugfix bugfix-123
   ```
   This creates a new directory with a separate working copy of your repository.

3. **Run Claude Code in each worktree**
   ```bash
   # Navigate to your worktree
   cd ../project-feature-a

   # Run Claude Code in this isolated environment
   claude
   ```

4. **Run Claude in another worktree**
   ```bash
   cd ../project-bugfix
   claude
   ```

5. **Manage your worktrees**
   ```bash
   # List all worktrees
   git worktree list

   # Remove a worktree when done
   git worktree remove ../project-feature-a
   ```

**Tips:**
- Each worktree has its own independent file state, making it perfect for parallel Claude Code sessions
- Changes made in one worktree won't affect others, preventing Claude instances from interfering with each other
- All worktrees share the same Git history and remote connections
- For long-running tasks, you can have Claude working in one worktree while you continue development in another
- Use descriptive directory names to easily identify which task each worktree is for
- Remember to initialize your development environment in each new worktree according to your project's setup

## Use Claude as a Unix-Style Utility

### Add Claude to Your Verification Process

Suppose you want to use Claude Code as a linter or code reviewer.

Add Claude to your build script:

```json
// package.json
{
  ...
  "scripts": {
    ...
    "lint:claude": "claude -p 'you are a linter. please look at the changes vs. main and report any issues related to typos. report the filename and line number on one line, and a description of the issue on the second line. do not return any other text.'"
  }
}
```

**Tips:**
- Use Claude for automated code review in your CI/CD pipeline
- Customize the prompt to check for specific issues relevant to your project
- Consider creating multiple scripts for different types of verification

### Pipe In, Pipe Out

Suppose you want to pipe data into Claude, and get back data in a structured format.

Pipe data through Claude:

```bash
cat build-error.txt | claude -p 'concisely explain the root cause of this build error' > output.txt
```

**Tips:**
- Use pipes to integrate Claude into existing shell scripts
- Combine with other Unix tools for powerful workflows
- Consider using `--output-format` for structured output

### Control Output Format

Suppose you need Claude's output in a specific format, especially when integrating Claude Code into scripts or other tools.

1. **Use text format (default)**
   ```bash
   cat data.txt | claude -p 'summarize this data' --output-format text > summary.txt
   ```
   This outputs just Claude's plain text response (default behavior).

2. **Use JSON format**
   ```bash
   cat code.py | claude -p 'analyze this code for bugs' --output-format json > analysis.json
   ```
   This outputs a JSON array of messages with metadata including cost and duration.

3. **Use streaming JSON format**
   ```bash
   cat log.txt | claude -p 'parse this log file for errors' --output-format stream-json
   ```
   This outputs a series of JSON objects in real-time as Claude processes the request. Each message is a valid JSON object, but the entire output is not valid JSON if concatenated.

**Tips:**
- Use `--output-format text` for simple integrations where you just need Claude's response
- Use `--output-format json` when you need the full conversation log
- Use `--output-format stream-json` for real-time output of each conversation turn

## Create Custom Slash Commands

Claude Code supports custom slash commands that you can create to quickly execute specific prompts or tasks. For more details, see the Slash commands reference page.

### Create Project-Specific Commands

Suppose you want to create reusable slash commands for your project that all team members can use.

1. **Create a commands directory in your project**
   ```bash
   mkdir -p .claude/commands
   ```

2. **Create a Markdown file for each command**
   ```bash
   echo "Analyze the performance of this code and suggest three specific optimizations:" > .claude/commands/optimize.md
   ```

3. **Use your custom command in Claude Code**
   ```
   > /optimize
   ```

**Tips:**
- Command names are derived from the filename (for example, optimize.md becomes /optimize)
- You can organize commands in subdirectories (for example, .claude/commands/frontend/component.md creates /component with "(project:frontend)" shown in the description)
- Project commands are available to everyone who clones the repository
- The Markdown file content becomes the prompt sent to Claude when the command is invoked

### Add Command Arguments with $ARGUMENTS

Suppose you want to create flexible slash commands that can accept additional input from users.

1. **Create a command file with the $ARGUMENTS placeholder**
   ```bash
   echo 'Find and fix issue #$ARGUMENTS. Follow these steps:
   1. Understand the issue described in the ticket
   2. Locate the relevant code in our codebase
   3. Implement a solution that addresses the root cause
   4. Add appropriate tests
   5. Prepare a concise PR description' > .claude/commands/fix-issue.md
   ```

2. **Use the command with an issue number**
   In your Claude session, use the command with arguments.
   ```
   > /fix-issue 123
   ```
   This replaces $ARGUMENTS with "123" in the prompt.

**Tips:**
- The $ARGUMENTS placeholder is replaced with any text that follows the command
- You can position $ARGUMENTS anywhere in your command template
- Other useful applications: generating test cases for specific functions, creating documentation for components, reviewing code in particular files, or translating content to specified languages

### Create Personal Slash Commands

Suppose you want to create personal slash commands that work across all your projects.

1. **Create a commands directory in your home folder**
   ```bash
   mkdir -p ~/.claude/commands
   ```

2. **Create a Markdown file for each command**
   ```bash
   echo "Review this code for security vulnerabilities, focusing on:" > ~/.claude/commands/security-review.md
   ```

3. **Use your personal custom command**
   ```
   > /security-review
   ```

**Tips:**
- Personal commands show "(user)" in their description when listed with /help
- Personal commands are only available to you and not shared with your team
- Personal commands work across all your projects
- You can use these for consistent workflows across different codebases

## Ask Claude About Its Capabilities

Claude has built-in access to its documentation and can answer questions about its own features and limitations.

### Example Questions

```
> can Claude Code create pull requests?
> how does Claude Code handle permissions?
> what slash commands are available?
> how do I use MCP with Claude Code?
> how do I configure Claude Code for Amazon Bedrock?
> what are the limitations of Claude Code?
```

Claude provides documentation-based answers to these questions. For executable examples and hands-on demonstrations, refer to the specific workflow sections above.

**Tips:**
- Claude always has access to the latest Claude Code documentation, regardless of the version you're using
- Ask specific questions to get detailed answers
- Claude can explain complex features like MCP integration, enterprise configurations, and advanced workflows

## Next Steps

Clone our development container reference implementation for Claude Code.
