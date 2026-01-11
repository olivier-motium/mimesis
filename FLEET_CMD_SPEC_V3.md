# Fleet Commander v3: Pure Claude Code Architecture

**Version:** 3.0
**Status:** Draft
**Updated:** 2026-01-11
**Design Principle:** Bet on model intelligence. The system gets better as models improve.

---

## Executive Summary

A multi-project monitoring system built **entirely within Claude Code** using hooks and subagents. No daemon logic beyond display. Workers spawn Sonnet subagents per-commit that write intelligence to a central Commander project.

### Core Philosophy

| Layer | Responsibility | Gets smarter over time? |
|-------|---------------|------------------------|
| Deterministic | File I/O, path resolution, queue format | No (by design) |
| Sonnet | Semantic analysis, doc/skill updates | **Yes** |
| Opus (Commander) | Cross-project reasoning, user interaction | **Yes** |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  COMMANDER PROJECT (~/.claude/commander/)                           │
│                                                                     │
│  Directory Structure:                                               │
│  ├── skills/projects/<project-id>/SKILL.md    ← Sonnet writes      │
│  ├── briefings/<project-id>/<commit-sha>.md   ← Sonnet writes      │
│  ├── pending.jsonl                            ← Queue when offline │
│  └── .claude/settings.json                    ← File change hooks  │
│                                                                     │
│  Commander Opus:                                                    │
│  - Hook fires when skills/briefings directories change              │
│  - Proactively outputs: "Fleet Update: Project A committed X"       │
│  - On startup, processes pending.jsonl queue                        │
│  - Answers cross-project questions from aggregated context          │
└─────────────────────────────────────────────────────────────────────┘
                    ▲
                    │ Sonnet writes here (using Edit tool)
                    │
┌─────────────────────────────────────────────────────────────────────┐
│  WORKER PROJECT (e.g., ~/projects/my-app)                           │
│                                                                     │
│  Worker Opus: Does actual coding work                               │
│                                                                     │
│  PostToolUse hook (Bash matcher):                                   │
│  - Detects "git commit" in command output                           │
│  - Spawns Sonnet subagent (background, non-blocking)                │
│                                                                     │
│  Sonnet Subagent:                                                   │
│  1. Runs git diff HEAD~1 to get changes                             │
│  2. Reads: .claude/MEMORIES.md, docs/index.md, CLAUDE.md            │
│  3. Writes to COMMANDER_PATH:                                       │
│     - skills/projects/<id>/SKILL.md (append-only sections)          │
│     - briefings/<id>/<sha>.md (full briefing)                       │
│  4. On error: appends to pending.jsonl with error details           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### Why Pure Claude Code?

| Alternative | Why Not |
|-------------|---------|
| Daemon orchestration | Adds complexity, doesn't bet on model intelligence |
| Git hooks | Installation friction, per-repo setup |
| Anthropic API direct | Bypasses Claude Code's context, tools, permissions |

**Pure Claude Code** means:
- All logic in `settings.json` hooks
- Subagents defined in `.claude/agents/`
- File watching via Claude Code hooks, not chokidar

### Why PostToolUse on Bash?

Claude Code doesn't have a native "git commit" event. Options considered:

| Approach | Chosen | Rationale |
|----------|--------|-----------|
| PostToolUse hook | ✅ | Fires after every Bash, script filters for commit |
| Git post-commit hook | ❌ | Requires per-repo installation |
| Stop hook diff check | ❌ | Batches multiple commits, less granular |
| Poll .git/refs | ❌ | Adds daemon complexity |

### Why Sonnet for Maintenance?

| Model | Use Case |
|-------|----------|
| Opus | Interactive work, user-facing, complex reasoning |
| Sonnet | Maintenance tasks, analysis, structured output |
| Haiku | Fast lookups, simple queries |

Sonnet is the sweet spot: capable enough for semantic analysis, fast and cheap enough to run per-commit.

### Why Workers Write to Commander's Directory?

The alternative (Commander reads worker directories) has problems:
- Commander needs to know all worker paths
- File watching across many directories is complex
- Permission issues if projects are in different locations

Instead: Workers know ONE path (Commander's) and write there. Commander watches ONE directory.

---

## File Formats

### SKILL.md Structure

```markdown
---
schema: skill.v1
project_id: my-app__a1b2c3d4
repo_name: my-app
repo_root: /Users/olivier/projects/my-app
last_commit: 5d6e7f8
updated: 2026-01-11T09:30:00Z
status: active  # active | idle | archived
---

# my-app

## Overview
<!-- REWRITABLE: Sonnet can update this section entirely -->
One-paragraph description of what this project does.

## Tech Stack
<!-- REWRITABLE -->
- Framework: Next.js 15
- Database: PostgreSQL
- Key patterns: ...

## Recent Activity
<!-- APPEND-ONLY: Sonnet adds entries, doesn't remove -->
- 2026-01-11: Implemented auth middleware (commit 5d6e7f8)
- 2026-01-10: Added user registration flow (commit 1a2b3c4)

## Current State
<!-- REWRITABLE -->
Status: Working on OAuth integration
Blockers: Waiting on client ID from ops
Next: Complete token refresh logic

## Key Files
<!-- REWRITABLE -->
- src/auth/* - Authentication logic
- docs/auth.md - Auth documentation
```

### Briefing File Structure

Location: `~/.claude/commander/briefings/<project-id>/<commit-sha>.md`

```markdown
---
schema: briefing.v1
project_id: my-app__a1b2c3d4
commit_sha: 5d6e7f8
parent_sha: 1a2b3c4
branch: feature/auth
author: Claude Code
timestamp: 2026-01-11T09:30:00Z
status: completed  # pending | completed | error

impact_level: moderate  # trivial | minor | moderate | major
broadcast_level: highlight  # silent | mention | highlight
doc_drift_risk: high  # low | medium | high
skill_updated: true
---

## Summary
Added OAuth middleware skeleton and environment configuration.

## Changes
- `src/middleware/auth.ts`: New file, JWT validation
- `src/config/env.ts`: Added OAUTH_* variables
- `docs/auth.md`: Updated with middleware docs

## Business Impact
Enables third-party login (Google, GitHub). Prerequisite for SSO feature.

## Technical Notes
- Uses jose library for JWT (not jsonwebtoken - ESM compatibility)
- Token refresh happens client-side via interceptor

## Risks
- docs/api.md may need update (new auth headers)
- MEMORIES.md should note the jose decision

## Suggested Follow-ups
- Update API docs with new Authorization header format
- Add integration tests for token refresh flow
```

### pending.jsonl Format

Location: `~/.claude/commander/pending.jsonl`

```json
{"type":"briefing","project_id":"my-app__a1b2c3d4","commit_sha":"5d6e7f8","timestamp":"2026-01-11T09:30:00Z","path":"briefings/my-app__a1b2c3d4/5d6e7f8.md"}
{"type":"skill_update","project_id":"my-app__a1b2c3d4","timestamp":"2026-01-11T09:30:00Z","path":"skills/projects/my-app__a1b2c3d4/SKILL.md"}
{"type":"error","project_id":"my-app__a1b2c3d4","commit_sha":"abc123","timestamp":"2026-01-11T10:00:00Z","error":"Failed to read MEMORIES.md: file not found"}
```

---

## Hook Configurations

### Worker Project: settings.json

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/detect-commit.py",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### detect-commit.py

```python
#!/usr/bin/env python3
"""
PostToolUse hook - detects git commit commands and spawns Sonnet subagent.
Reads tool output from stdin, checks if it was a commit.
"""
import json
import sys
import subprocess
import os

COMMANDER_PATH = os.path.expanduser("~/.claude/commander")

def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})
    tool_output = input_data.get("tool_output", "")

    if tool_name != "Bash":
        sys.exit(0)

    command = tool_input.get("command", "")

    # Check if this was a commit command
    if "git commit" not in command:
        sys.exit(0)

    # Check if commit succeeded (look for commit hash in output)
    if "create mode" not in tool_output and "[" not in tool_output:
        sys.exit(0)  # Commit may have failed

    # Get commit SHA
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5
        )
        commit_sha = result.stdout.strip()[:12]
    except:
        sys.exit(0)

    cwd = input_data.get("cwd", os.getcwd())

    # Output instruction for Claude to spawn subagent
    # This becomes a system message that Claude sees
    instruction = f"""<system-reminder>
COMMIT DETECTED: {commit_sha}

Spawn the post-commit-analyst subagent in the background with this context:
- Project: {cwd}
- Commit: {commit_sha}
- Commander path: {COMMANDER_PATH}

The subagent will analyze changes and update the Commander's skill store.
</system-reminder>"""

    print(instruction)
    sys.exit(0)

if __name__ == "__main__":
    main()
```

### Commander Project: settings.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/commander-startup.py",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### commander-startup.py

```python
#!/usr/bin/env python3
"""
SessionStart hook for Commander - processes pending queue and loads context.
"""
import json
import sys
import os
from pathlib import Path

COMMANDER_PATH = Path.home() / ".claude" / "commander"
PENDING_FILE = COMMANDER_PATH / "pending.jsonl"

def main():
    pending_count = 0
    pending_items = []

    if PENDING_FILE.exists():
        with open(PENDING_FILE) as f:
            for line in f:
                if line.strip():
                    pending_items.append(json.loads(line))
                    pending_count += 1

    if pending_count == 0:
        print("<system-reminder>Fleet Commander ready. No pending updates.</system-reminder>")
        sys.exit(0)

    # Summarize pending items
    briefings = [p for p in pending_items if p["type"] == "briefing"]
    errors = [p for p in pending_items if p["type"] == "error"]

    summary = f"""<system-reminder>
FLEET COMMANDER STARTUP - {pending_count} pending updates

Briefings to process: {len(briefings)}
Errors to review: {len(errors)}

Read the pending queue at {PENDING_FILE} and process each item:
1. For briefings: Read the briefing file, summarize to user
2. For errors: Report the error and suggest resolution
3. Clear processed items from pending.jsonl

Projects with updates:
{chr(10).join(f"- {p['project_id']}" for p in briefings[:5])}
</system-reminder>"""

    print(summary)
    sys.exit(0)

if __name__ == "__main__":
    main()
```

---

## Subagent Definition

### post-commit-analyst.md

Location: `~/.claude/agents/post-commit-analyst.md`

```markdown
---
name: post-commit-analyst
description: Analyzes git commits and updates the Fleet Commander's skill store. Use in background after detecting a commit.
tools: Read, Bash, Edit, Write
model: sonnet
permissionMode: acceptEdits
---

You are a post-commit analyst. Your job is to analyze a git commit and update the Fleet Commander's knowledge base.

## Input

You receive:
- Project path (cwd)
- Commit SHA
- Commander path (where to write output)

## Process

1. **Get the diff**
   ```bash
   git show <commit_sha> --stat
   git diff <commit_sha>~1 <commit_sha>
   ```

2. **Read project context**
   - `.claude/MEMORIES.md` (if exists) - high-value learnings
   - `docs/index.md` (if exists) - documentation structure
   - `CLAUDE.md` (if exists) - project conventions

3. **Analyze changes**
   Determine:
   - What changed (files, functions, features)
   - Business impact (what does this enable?)
   - Technical notes (patterns, libraries, gotchas)
   - Doc drift risk (are docs now stale?)
   - Suggested follow-ups

4. **Write briefing**
   Create: `<commander_path>/briefings/<project_id>/<commit_sha>.md`
   Use the briefing.v1 schema with all frontmatter fields.

5. **Update SKILL.md**
   Edit: `<commander_path>/skills/projects/<project_id>/SKILL.md`
   - Update REWRITABLE sections with current state
   - APPEND to Recent Activity section
   - Create file if it doesn't exist

6. **Queue notification**
   Append to: `<commander_path>/pending.jsonl`
   ```json
   {"type":"briefing","project_id":"...","commit_sha":"...","timestamp":"...","path":"..."}
   ```

## Output Format

When done, output a single line summary:
```
Briefing complete: <project_id>/<commit_sha> (impact: <level>)
```

## Error Handling

If any step fails:
1. Append error to pending.jsonl
2. Continue with remaining steps if possible
3. Output: `Briefing failed: <project_id>/<commit_sha> - <error>`

## Constraints

- Do NOT modify the worker project's files
- Do NOT interact with the user
- Keep analysis concise (briefing < 500 words)
- Focus on WHAT and WHY, not HOW
```

---

## Project Discovery

Projects are discovered by the presence of `.claude/status.*.md` files.

### Status Lifecycle

| Status | Meaning | Trigger |
|--------|---------|---------|
| active | Currently being worked on | Recent commit or status file update |
| idle | No activity in 24h+ | Time-based, automatic |
| archived | User manually archived | User command to Commander |

Idle projects keep their SKILL.md in the store. Commander knows they're stale.

### Project ID Generation

```python
def generate_project_id(repo_root: str) -> str:
    """Generate stable project_id from git info."""
    import hashlib
    import subprocess
    from pathlib import Path

    try:
        remote = subprocess.check_output(
            ["git", "remote", "get-url", "origin"],
            cwd=repo_root, text=True
        ).strip()
        repo_name = Path(repo_root).name
        hash_input = f"{remote}:{repo_name}"
        short_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:8]
        return f"{repo_name}__{short_hash}"
    except:
        # Fallback to path hash
        short_hash = hashlib.sha256(repo_root.encode()).hexdigest()[:8]
        return f"{Path(repo_root).name}__{short_hash}"
```

---

## Error Handling

### Error Types

| Error | Handling |
|-------|----------|
| Sonnet subagent fails | Append to pending.jsonl with type: "error" |
| Can't read project files | Log error, skip that input, continue |
| Can't write to Commander | Retry once, then append error to local fallback |
| Invalid commit SHA | Skip analysis, log warning |

### Error Queue Entry

```json
{
  "type": "error",
  "project_id": "my-app__a1b2c3d4",
  "commit_sha": "abc123",
  "timestamp": "2026-01-11T10:00:00Z",
  "error": "Failed to read MEMORIES.md: ENOENT",
  "context": {
    "step": "read_context",
    "attempted_path": "/Users/olivier/projects/my-app/.claude/MEMORIES.md"
  }
}
```

Commander surfaces errors in proactive updates:
```
Fleet Alert: Briefing failed for my-app commit abc123 - couldn't read MEMORIES.md
```

---

## Commander UX

### Proactive Updates

When Commander detects new briefings (via hook or pending queue):

```
📡 Fleet Update

my-app (commit 5d6e7f8, 2 min ago):
  OAuth middleware skeleton added. Impact: MODERATE.
  ⚠️ Doc drift risk HIGH - API docs may need auth header update.

other-project (commit 1a2b3c4, 15 min ago):
  Bug fix in payment retry logic. Impact: MINOR.
```

### Cross-Project Queries

User can ask:
- "What's happening across my projects?"
- "Which projects have stale docs?"
- "Summarize activity in the last 24 hours"
- "Does any project use the jose library?"

Commander answers by reading its skill store and briefings.

---

## Implementation Phases

### Phase 1: Hooks & Subagent Definition
- [ ] Create `~/.claude/hooks/detect-commit.py`
- [ ] Create `~/.claude/agents/post-commit-analyst.md`
- [ ] Create Commander project structure
- [ ] Add PostToolUse hook to worker settings.json

### Phase 2: File Writing & Queue
- [ ] Implement SKILL.md creation/update in subagent
- [ ] Implement briefing file writing
- [ ] Implement pending.jsonl queue
- [ ] Test error handling

### Phase 3: Commander Integration
- [ ] Create `~/.claude/hooks/commander-startup.py`
- [ ] Add SessionStart hook to Commander settings.json
- [ ] Implement file change detection for proactive updates
- [ ] Test cross-project queries

### Phase 4: Polish
- [ ] Add project ID generation
- [ ] Implement idle detection
- [ ] Add error recovery
- [ ] Document user-facing commands

---

## Comparison to v2 Spec

| Aspect | v2 | v3 |
|--------|----|----|
| Commit detection | Git post-commit hook | PostToolUse on Bash |
| Task sizing | Diff thresholds | Sonnet semantic analysis |
| Skill updates | Daemon processes queue | Subagent writes directly |
| Implementation | Daemon + hooks hybrid | Pure Claude Code |
| Sonnet invocation | "Assumed future support" | Native subagent with model: sonnet |

---

## Open Questions

1. **File change hook for Commander**: Claude Code doesn't have a native "file changed" hook. Options:
   - Polling in SessionStart
   - External file watcher that writes to pending.jsonl
   - Manual "check fleet" command

2. **Subagent background execution**: The spec assumes background subagents work reliably. Need to test edge cases (long-running analysis, worker exits before subagent finishes).

3. **Commander path configuration**: Currently hardcoded to `~/.claude/commander`. Should this be configurable per-worker?
