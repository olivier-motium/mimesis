# Fleet Commander v4: Headless Claude Code Architecture

**Version:** 4.0
**Status:** Draft
**Updated:** 2026-01-11
**Design Principle:** Bet on model intelligence for content. Bet on determinism for execution.

---

## Executive Summary

A multi-project monitoring system using **headless Claude Code sessions** (`claude -p`) for per-commit analysis. Workers trigger commits → queue → runner invokes Sonnet → writes to Commander store. Commander Opus reads the store and answers cross-project questions.

### Why Headless Over Subagents (V3 → V4)

| Aspect | V3 (Subagents) | V4 (Headless) |
|--------|----------------|---------------|
| Trigger flow | Hook → reminder → Opus decides to spawn | Hook → queue → runner → `claude -p` |
| Determinism | "Opus should notice" | "CLI will execute" |
| Context | Inherits worker session | Fresh, bounded context |
| Permissions | Trust the model | `defaultMode: "dontAsk"` enforced |
| Recursion | Hope hooks don't loop | `disableAllHooks: true` |
| Output format | Markdown (model decides) | `--json-schema` contract |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  WORKER PROJECT (e.g., ~/projects/my-app)                           │
│                                                                     │
│  Worker Opus: Does actual coding work                               │
│                                                                     │
│  PostToolUse hook (Bash matcher):                                   │
│  - Detects "git commit" in command                                  │
│  - Verifies HEAD changed (prevents false positives)                 │
│  - Appends commit event to queue                                    │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Appends to
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  QUEUE: ~/.claude/commander/queue/commits.jsonl                     │
│                                                                     │
│  {"repo":"/path/to/repo","sha":"abc123","ts":"2026-01-11T10:00:00Z"}│
│  {"repo":"/path/to/repo","sha":"def456","ts":"2026-01-11T10:05:00Z"}│
└────────────────────────┬────────────────────────────────────────────┘
                         │ Consumed by
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RUNNER (daemon or launchd/systemd service)                         │
│                                                                     │
│  - Watches queue, tracks cursor position                            │
│  - For each commit:                                                 │
│    claude -p --model sonnet \                                       │
│            --json-schema ~/.claude/commander/schemas/briefing.json \│
│            --settings ~/.claude/commander/analyst.settings.json \  │
│            --add-dir ~/.claude/commander \                          │
│            "Analyze commit <sha> in <repo>..."                      │
│  - Parses JSON output                                               │
│  - Writes files atomically                                          │
│  - Updates cursor                                                   │
└────────────────────────┬────────────────────────────────────────────┘
                         │ Writes to
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  COMMANDER STORE (~/.claude/commander/)                             │
│                                                                     │
│  ├── skills/projects/<project-id>/SKILL.md    ← Runner writes       │
│  ├── briefings/<project-id>/<commit-sha>.md   ← Runner writes       │
│  ├── queue/commits.jsonl                      ← Hook appends        │
│  ├── queue/cursor                             ← Runner tracks       │
│  ├── schemas/briefing.json                    ← JSON schema         │
│  └── analyst.settings.json                    ← Headless config     │
│                                                                     │
│  Commander Opus (interactive):                                      │
│  - On startup, summarizes new briefings since last session          │
│  - Answers cross-project questions from aggregated context          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### Why Headless `claude -p`?

Claude Code's print mode is designed for automation:
- `--model sonnet` - explicit model selection
- `--json-schema` - structured, validatable output
- `--output-format json` - machine-readable
- `--add-dir` - include Commander store in context
- `--settings` - custom permissions file

This gives us **model intelligence for content** with **deterministic execution**.

### Why a Queue + Runner?

The alternative (inline execution in hook) has problems:
- Blocks the worker session while Sonnet runs
- No retry on failure
- Lost commits if daemon is down

Queue + Runner provides:
- Async, non-blocking commits
- Resilience to restarts
- Batch processing for rapid commits
- Clear separation of concerns

### Why Dedicated Settings File?

The headless Sonnet job needs different permissions than interactive sessions:

```json
{
  "disableAllHooks": true,
  "permissions": {
    "defaultMode": "dontAsk",
    "allow": [
      "Bash(git show:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git rev-parse:*)",
      "Read(//~/.claude/commander/**)",
      "Read(//**/MEMORIES.md)",
      "Read(//**/CLAUDE.md)",
      "Read(//**/docs/**)",
      "Edit(//~/.claude/commander/**)",
      "Write(//~/.claude/commander/**)"
    ],
    "deny": [
      "Bash(*)",
      "Edit(*)",
      "Write(*)"
    ]
  }
}
```

Key properties:
- `disableAllHooks: true` - prevents recursion
- `defaultMode: "dontAsk"` - fails fast on unauthorized actions
- Explicit allowlist for git reads and Commander writes
- Deny-by-default for everything else

---

## File Formats

### JSON Schema for Briefing Output

Location: `~/.claude/commander/schemas/briefing.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["briefing", "skill_update"],
  "properties": {
    "briefing": {
      "type": "object",
      "required": ["summary", "changes", "impact_level", "doc_drift_risk"],
      "properties": {
        "summary": {
          "type": "string",
          "description": "One paragraph summary of what this commit does"
        },
        "changes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["file", "description"],
            "properties": {
              "file": { "type": "string" },
              "description": { "type": "string" }
            }
          }
        },
        "business_impact": {
          "type": "string",
          "description": "What does this enable or fix for users?"
        },
        "technical_notes": {
          "type": "string",
          "description": "Patterns, libraries, or gotchas worth noting"
        },
        "impact_level": {
          "type": "string",
          "enum": ["trivial", "minor", "moderate", "major"]
        },
        "doc_drift_risk": {
          "type": "string",
          "enum": ["low", "medium", "high"]
        },
        "suggested_followups": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "skill_update": {
      "type": "object",
      "required": ["recent_activity_entry"],
      "properties": {
        "overview": {
          "type": "string",
          "description": "Updated project overview (null if no change)"
        },
        "tech_stack": {
          "type": "string",
          "description": "Updated tech stack section (null if no change)"
        },
        "current_state": {
          "type": "string",
          "description": "Updated current state section (null if no change)"
        },
        "recent_activity_entry": {
          "type": "string",
          "description": "Single line to append to Recent Activity"
        },
        "key_files": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Updated key files list (null if no change)"
        }
      }
    }
  }
}
```

### Queue Format

Location: `~/.claude/commander/queue/commits.jsonl`

```json
{"repo":"/Users/olivier/projects/my-app","sha":"5d6e7f8","branch":"main","ts":"2026-01-11T09:30:00Z"}
{"repo":"/Users/olivier/projects/other","sha":"1a2b3c4","branch":"feature/auth","ts":"2026-01-11T09:35:00Z"}
```

### Cursor Format

Location: `~/.claude/commander/queue/cursor`

```
12
```

Simple byte offset into commits.jsonl. Runner reads from this position.

### SKILL.md Structure

Location: `~/.claude/commander/skills/projects/<project-id>/SKILL.md`

```markdown
---
schema: skill.v1
project_id: my-app__a1b2c3d4
repo_name: my-app
repo_root: /Users/olivier/projects/my-app
last_commit: 5d6e7f8
updated: 2026-01-11T09:30:00Z
status: active
---

# my-app

## Overview
One-paragraph description of what this project does.

## Tech Stack
- Framework: Next.js 15
- Database: PostgreSQL
- Key patterns: ...

## Recent Activity
- 2026-01-11: Implemented auth middleware (commit 5d6e7f8)
- 2026-01-10: Added user registration flow (commit 1a2b3c4)

## Current State
Status: Working on OAuth integration
Blockers: Waiting on client ID from ops
Next: Complete token refresh logic

## Key Files
- src/auth/* - Authentication logic
- docs/auth.md - Auth documentation
```

### Briefing File Structure

Location: `~/.claude/commander/briefings/<project-id>/<commit-sha>.md`

Generated from JSON output by the runner:

```markdown
---
schema: briefing.v1
project_id: my-app__a1b2c3d4
commit_sha: 5d6e7f8
branch: feature/auth
timestamp: 2026-01-11T09:30:00Z
impact_level: moderate
doc_drift_risk: high
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
Uses jose library for JWT (not jsonwebtoken - ESM compatibility).
Token refresh happens client-side via interceptor.

## Suggested Follow-ups
- Update API docs with new Authorization header format
- Add integration tests for token refresh flow
```

---

## Hook Configuration

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
            "command": "python3 ~/.claude/hooks/queue-commit.py",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### queue-commit.py

```python
#!/usr/bin/env python3
"""
PostToolUse hook - detects git commits and queues for analysis.
Does NOT spawn anything - just appends to queue file.
"""
import json
import sys
import subprocess
import os
from pathlib import Path
from datetime import datetime, timezone

QUEUE_FILE = Path.home() / ".claude" / "commander" / "queue" / "commits.jsonl"

def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    if tool_name != "Bash":
        sys.exit(0)

    command = tool_input.get("command", "")

    # Check if this was a commit command
    if "git commit" not in command:
        sys.exit(0)

    cwd = input_data.get("cwd", os.getcwd())

    # Get current HEAD to verify commit happened
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=cwd
        )
        if result.returncode != 0:
            sys.exit(0)
        sha = result.stdout.strip()[:12]

        # Get branch name
        branch_result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=cwd
        )
        branch = branch_result.stdout.strip() if branch_result.returncode == 0 else "unknown"
    except Exception:
        sys.exit(0)

    # Ensure queue directory exists
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Append to queue
    event = {
        "repo": cwd,
        "sha": sha,
        "branch": branch,
        "ts": datetime.now(timezone.utc).isoformat()
    }

    with open(QUEUE_FILE, "a") as f:
        f.write(json.dumps(event) + "\n")

    # Silent success - don't print anything to avoid cluttering output
    sys.exit(0)

if __name__ == "__main__":
    main()
```

---

## Runner Implementation

### runner.py

Location: `~/.claude/commander/runner.py`

```python
#!/usr/bin/env python3
"""
Fleet Commander Runner - processes commit queue with headless Sonnet.

Run as: python3 ~/.claude/commander/runner.py
Or configure as launchd/systemd service.
"""
import json
import subprocess
import sys
import time
import os
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import fcntl

COMMANDER_PATH = Path.home() / ".claude" / "commander"
QUEUE_FILE = COMMANDER_PATH / "queue" / "commits.jsonl"
CURSOR_FILE = COMMANDER_PATH / "queue" / "cursor"
LOCK_FILE = COMMANDER_PATH / "queue" / ".lock"
SCHEMA_FILE = COMMANDER_PATH / "schemas" / "briefing.json"
SETTINGS_FILE = COMMANDER_PATH / "analyst.settings.json"

POLL_INTERVAL = 5  # seconds


def get_cursor() -> int:
    """Get current queue cursor position."""
    if CURSOR_FILE.exists():
        return int(CURSOR_FILE.read_text().strip())
    return 0


def set_cursor(pos: int):
    """Update cursor position."""
    CURSOR_FILE.write_text(str(pos))


def generate_project_id(repo_root: str) -> str:
    """Generate stable project_id from git info."""
    try:
        remote = subprocess.check_output(
            ["git", "remote", "get-url", "origin"],
            cwd=repo_root, text=True, stderr=subprocess.DEVNULL
        ).strip()
        repo_name = Path(repo_root).name
        hash_input = f"{remote}:{repo_name}"
        short_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:8]
        return f"{repo_name}__{short_hash}"
    except Exception:
        short_hash = hashlib.sha256(repo_root.encode()).hexdigest()[:8]
        return f"{Path(repo_root).name}__{short_hash}"


def run_sonnet_analysis(repo: str, sha: str, branch: str) -> dict | None:
    """Run headless Sonnet analysis on a commit."""
    project_id = generate_project_id(repo)

    prompt = f"""Analyze git commit {sha} in repository {repo}.

1. Run: git show {sha} --stat
2. Run: git diff {sha}~1 {sha}
3. Read project context files if they exist:
   - {repo}/.claude/MEMORIES.md
   - {repo}/docs/index.md
   - {repo}/CLAUDE.md
4. Analyze the changes and produce structured output.

Project ID for this repo: {project_id}
Branch: {branch}

Focus on:
- What changed and why
- Business impact
- Technical patterns worth noting
- Whether docs might be stale now
"""

    try:
        result = subprocess.run(
            [
                "claude", "-p",
                "--model", "sonnet",
                "--output-format", "json",
                "--json-schema", str(SCHEMA_FILE),
                "--settings", str(SETTINGS_FILE),
                "--add-dir", str(COMMANDER_PATH),
                prompt
            ],
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout
            cwd=repo
        )

        if result.returncode != 0:
            print(f"[Runner] Sonnet failed for {sha}: {result.stderr}", file=sys.stderr)
            return None

        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        print(f"[Runner] Timeout analyzing {sha}", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"[Runner] Invalid JSON from Sonnet for {sha}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[Runner] Error analyzing {sha}: {e}", file=sys.stderr)
        return None


def write_briefing(project_id: str, sha: str, branch: str, data: dict):
    """Write briefing markdown file."""
    briefing_dir = COMMANDER_PATH / "briefings" / project_id
    briefing_dir.mkdir(parents=True, exist_ok=True)

    briefing = data["briefing"]
    timestamp = datetime.now(timezone.utc).isoformat()

    content = f"""---
schema: briefing.v1
project_id: {project_id}
commit_sha: {sha}
branch: {branch}
timestamp: {timestamp}
impact_level: {briefing['impact_level']}
doc_drift_risk: {briefing['doc_drift_risk']}
---

## Summary
{briefing['summary']}

## Changes
"""
    for change in briefing.get("changes", []):
        content += f"- `{change['file']}`: {change['description']}\n"

    if briefing.get("business_impact"):
        content += f"\n## Business Impact\n{briefing['business_impact']}\n"

    if briefing.get("technical_notes"):
        content += f"\n## Technical Notes\n{briefing['technical_notes']}\n"

    if briefing.get("suggested_followups"):
        content += "\n## Suggested Follow-ups\n"
        for followup in briefing["suggested_followups"]:
            content += f"- {followup}\n"

    briefing_file = briefing_dir / f"{sha}.md"
    briefing_file.write_text(content)
    print(f"[Runner] Wrote briefing: {briefing_file}")


def update_skill(project_id: str, repo: str, sha: str, data: dict):
    """Update or create SKILL.md for project."""
    skill_dir = COMMANDER_PATH / "skills" / "projects" / project_id
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_file = skill_dir / "SKILL.md"

    skill_update = data["skill_update"]
    timestamp = datetime.now(timezone.utc).isoformat()
    repo_name = Path(repo).name

    if skill_file.exists():
        # Update existing file
        content = skill_file.read_text()

        # Update frontmatter
        content = update_frontmatter(content, sha, timestamp)

        # Append to Recent Activity
        if skill_update.get("recent_activity_entry"):
            entry = skill_update["recent_activity_entry"]
            date = datetime.now().strftime("%Y-%m-%d")
            new_entry = f"- {date}: {entry} (commit {sha})"
            content = append_to_section(content, "## Recent Activity", new_entry)

        # Update rewritable sections if provided
        for section, key in [
            ("## Overview", "overview"),
            ("## Tech Stack", "tech_stack"),
            ("## Current State", "current_state"),
        ]:
            if skill_update.get(key):
                content = update_section(content, section, skill_update[key])

        if skill_update.get("key_files"):
            key_files_content = "\n".join(f"- {f}" for f in skill_update["key_files"])
            content = update_section(content, "## Key Files", key_files_content)

        skill_file.write_text(content)
    else:
        # Create new SKILL.md
        content = f"""---
schema: skill.v1
project_id: {project_id}
repo_name: {repo_name}
repo_root: {repo}
last_commit: {sha}
updated: {timestamp}
status: active
---

# {repo_name}

## Overview
{skill_update.get('overview', 'No overview yet.')}

## Tech Stack
{skill_update.get('tech_stack', 'Not yet analyzed.')}

## Recent Activity
- {datetime.now().strftime('%Y-%m-%d')}: {skill_update.get('recent_activity_entry', 'Initial analysis')} (commit {sha})

## Current State
{skill_update.get('current_state', 'Analysis in progress.')}

## Key Files
"""
        if skill_update.get("key_files"):
            for f in skill_update["key_files"]:
                content += f"- {f}\n"
        else:
            content += "- (pending analysis)\n"

        skill_file.write_text(content)

    print(f"[Runner] Updated skill: {skill_file}")


def update_frontmatter(content: str, sha: str, timestamp: str) -> str:
    """Update last_commit and updated in frontmatter."""
    lines = content.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("last_commit:"):
            lines[i] = f"last_commit: {sha}"
        elif line.startswith("updated:"):
            lines[i] = f"updated: {timestamp}"
    return "\n".join(lines)


def append_to_section(content: str, section_header: str, entry: str) -> str:
    """Append entry after section header."""
    lines = content.split("\n")
    for i, line in enumerate(lines):
        if line.strip() == section_header:
            # Find next non-empty line after header
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            # Insert entry
            lines.insert(j, entry)
            break
    return "\n".join(lines)


def update_section(content: str, section_header: str, new_content: str) -> str:
    """Replace section content (until next ## header)."""
    lines = content.split("\n")
    result = []
    in_section = False
    section_replaced = False

    for line in lines:
        if line.strip() == section_header:
            in_section = True
            section_replaced = True
            result.append(line)
            result.append(new_content)
        elif in_section and line.startswith("## "):
            in_section = False
            result.append(line)
        elif not in_section:
            result.append(line)
        # Skip lines in the section being replaced

    return "\n".join(result)


def process_commit(event: dict) -> bool:
    """Process a single commit event. Returns True on success."""
    repo = event["repo"]
    sha = event["sha"]
    branch = event.get("branch", "unknown")

    print(f"[Runner] Processing {sha} from {repo}")

    # Run Sonnet analysis
    result = run_sonnet_analysis(repo, sha, branch)
    if not result:
        return False

    project_id = generate_project_id(repo)

    # Write outputs
    write_briefing(project_id, sha, branch, result)
    update_skill(project_id, repo, sha, result)

    return True


def main():
    """Main runner loop."""
    print(f"[Runner] Starting Fleet Commander runner")
    print(f"[Runner] Queue: {QUEUE_FILE}")
    print(f"[Runner] Schema: {SCHEMA_FILE}")

    # Ensure directories exist
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    (COMMANDER_PATH / "schemas").mkdir(parents=True, exist_ok=True)

    while True:
        try:
            # Acquire lock
            with open(LOCK_FILE, "w") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

                if not QUEUE_FILE.exists():
                    time.sleep(POLL_INTERVAL)
                    continue

                cursor = get_cursor()
                queue_size = QUEUE_FILE.stat().st_size

                if cursor >= queue_size:
                    time.sleep(POLL_INTERVAL)
                    continue

                # Read new events
                with open(QUEUE_FILE) as f:
                    f.seek(cursor)
                    new_lines = f.read()
                    new_cursor = f.tell()

                for line in new_lines.strip().split("\n"):
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                        if process_commit(event):
                            print(f"[Runner] Success: {event['sha']}")
                        else:
                            print(f"[Runner] Failed: {event['sha']}", file=sys.stderr)
                    except json.JSONDecodeError:
                        print(f"[Runner] Invalid JSON in queue: {line}", file=sys.stderr)

                set_cursor(new_cursor)

        except BlockingIOError:
            # Another runner instance has the lock
            time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print("\n[Runner] Shutting down")
            break
        except Exception as e:
            print(f"[Runner] Error: {e}", file=sys.stderr)
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
```

---

## Analyst Settings

Location: `~/.claude/commander/analyst.settings.json`

```json
{
  "disableAllHooks": true,
  "permissions": {
    "defaultMode": "dontAsk",
    "allow": [
      "Bash(git show:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git rev-parse:*)",
      "Read(//~/.claude/commander/**)",
      "Read(//**/.claude/MEMORIES.md)",
      "Read(//**/CLAUDE.md)",
      "Read(//**/docs/**)",
      "Edit(//~/.claude/commander/**)",
      "Write(//~/.claude/commander/**)"
    ],
    "deny": [
      "Bash(*)",
      "Edit(*)",
      "Write(*)"
    ]
  }
}
```

---

## Commander Integration

### Commander SessionStart Hook

Location: `~/.claude/commander/.claude/settings.json`

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
SessionStart hook for Commander - summarizes new briefings.
"""
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta

COMMANDER_PATH = Path.home() / ".claude" / "commander"
BRIEFINGS_DIR = COMMANDER_PATH / "briefings"
LAST_SEEN_FILE = COMMANDER_PATH / ".last_seen"


def get_last_seen() -> datetime:
    """Get timestamp of last Commander session."""
    if LAST_SEEN_FILE.exists():
        ts = LAST_SEEN_FILE.read_text().strip()
        return datetime.fromisoformat(ts)
    return datetime.now() - timedelta(days=1)


def set_last_seen():
    """Update last seen timestamp."""
    LAST_SEEN_FILE.write_text(datetime.now().isoformat())


def get_new_briefings(since: datetime) -> list[dict]:
    """Find briefings created after the given timestamp."""
    briefings = []

    if not BRIEFINGS_DIR.exists():
        return briefings

    for project_dir in BRIEFINGS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        for briefing_file in project_dir.glob("*.md"):
            if briefing_file.stat().st_mtime > since.timestamp():
                # Parse frontmatter
                content = briefing_file.read_text()
                lines = content.split("\n")
                frontmatter = {}
                in_frontmatter = False
                for line in lines:
                    if line.strip() == "---":
                        if in_frontmatter:
                            break
                        in_frontmatter = True
                        continue
                    if in_frontmatter and ":" in line:
                        key, value = line.split(":", 1)
                        frontmatter[key.strip()] = value.strip()

                briefings.append({
                    "project_id": frontmatter.get("project_id", project_dir.name),
                    "commit_sha": frontmatter.get("commit_sha", briefing_file.stem),
                    "impact_level": frontmatter.get("impact_level", "unknown"),
                    "doc_drift_risk": frontmatter.get("doc_drift_risk", "unknown"),
                    "path": str(briefing_file)
                })

    return briefings


def main():
    last_seen = get_last_seen()
    new_briefings = get_new_briefings(last_seen)
    set_last_seen()

    if not new_briefings:
        print("<system-reminder>Fleet Commander ready. No new briefings since last session.</system-reminder>")
        sys.exit(0)

    # Group by project
    by_project = {}
    for b in new_briefings:
        pid = b["project_id"]
        if pid not in by_project:
            by_project[pid] = []
        by_project[pid].append(b)

    summary = f"""<system-reminder>
FLEET COMMANDER STARTUP - {len(new_briefings)} new briefing(s)

"""
    for project_id, briefings in by_project.items():
        summary += f"📁 {project_id}: {len(briefings)} commit(s)\n"
        for b in briefings[:3]:  # Show first 3
            risk_emoji = "⚠️" if b["doc_drift_risk"] == "high" else ""
            summary += f"   - {b['commit_sha']} ({b['impact_level']}) {risk_emoji}\n"
        if len(briefings) > 3:
            summary += f"   - ... and {len(briefings) - 3} more\n"

    summary += """
Read the briefing files for details. Use 'ls ~/.claude/commander/briefings/' to explore.
</system-reminder>"""

    print(summary)
    sys.exit(0)


if __name__ == "__main__":
    main()
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create `~/.claude/commander/` directory structure
- [ ] Create `schemas/briefing.json` JSON schema
- [ ] Create `analyst.settings.json` with permissions
- [ ] Create `queue-commit.py` hook
- [ ] Add PostToolUse hook to worker settings.json

### Phase 2: Runner
- [ ] Implement `runner.py`
- [ ] Test with manual queue entries
- [ ] Add launchd/systemd service file
- [ ] Test error handling and recovery

### Phase 3: Commander Integration
- [ ] Create Commander project structure
- [ ] Create `commander-startup.py` hook
- [ ] Test startup summary generation
- [ ] Verify cross-project queries work

### Phase 4: Polish
- [ ] Add project discovery from existing repos
- [ ] Implement idle detection
- [ ] Add queue compaction (remove old entries)
- [ ] Document user-facing commands

---

## Comparison to V3 (Subagent Architecture)

| Aspect | V3 | V4 |
|--------|----|----|
| Execution | Subagent spawned by Opus | `claude -p` invoked by runner |
| Trigger reliability | Hope Opus notices | Guaranteed by queue + runner |
| Permission model | Trust model behavior | `defaultMode: "dontAsk"` enforced |
| Output format | Model chooses | `--json-schema` contract |
| Recursion prevention | Hope hooks don't loop | `disableAllHooks: true` |
| Cold start | None (in-session) | Each job is fresh |
| Concurrency | Session-bound | Queue with locking |
| Offline resilience | pending.jsonl | commits.jsonl queue |

---

## Open Questions

1. **Runner supervision**: launchd (macOS) vs systemd (Linux) vs simple cron?

2. **Queue compaction**: How often to trim old entries from commits.jsonl?

3. **Model fallback**: If Sonnet fails, retry with Opus? Or just log and skip?

4. **Rate limiting**: If many commits come in rapidly (rebase), batch them?
