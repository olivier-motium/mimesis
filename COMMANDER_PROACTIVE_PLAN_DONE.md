# Commander Knowledge Base & `/improve` Command (v2.1)

## Vision

Transform Commander from a reactive fleet monitor into a **strategic advisor** with deep project knowledge. The key insight: we already maintain high-quality documentation in each project (`docs/`, `CLAUDE.md`, `MEMORIES.md`) plus rich operational data (briefings, blockers, doc drift). This data should flow into Commander's persistent knowledge base as two layers:

1. **Intent Layer** (docs) — What the project is, why it exists, design decisions (30% weight)
2. **Reality Layer** (briefings) — What's actually happening, recurring pain, churn hotspots (70% weight)

This enables `/improve` to ground suggestions in operational reality first, with docs as supporting context.

---

## Configuration Summary

Based on interview, these are the confirmed preferences:

| Setting | Value |
|---------|-------|
| **Implementation priority** | Phase 1 Foundation first |
| **Intent vs Reality weighting** | Reality-heavy (30/70) |
| **Sync trigger** | Manual only (`/knowledge-sync`) |
| **Briefing window** | 14 days |
| **Security** | Minimal (chmod 700 only) |
| **Monorepo support** | Required from day one |
| **Staleness handling** | Warn and proceed |
| **UI visibility** | Full panel (project list + freshness + sync button) |
| **Aliases** | Auto-generated + manual overrides |
| **Distillation model** | Sonnet |
| **Activity detail** | Summary stats + patterns |
| **Full re-distill** | Manual flag only (`--full`) |
| **Suggestion count** | 5-7 per /improve |
| **Data source for /improve** | KB + live DB query |
| **Code access** | KB + optional deep-dive |
| **Output format** | Markdown with evidence |
| **KB location** | `~/.claude/commander/knowledge/` |
| **Symlinks** | Both aliases.json + by-name/ |
| **Alias conflicts** | Warn on same repo name in different orgs |
| **Sync output** | Summary event only |
| **Distillation invocation** | Headless `claude -p` in command |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Managed Projects                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    MVP      │  │   Mimesis   │  │   API-SVC   │  │   Frontend  │         │
│  │   docs/     │  │   docs/     │  │   docs/     │  │   docs/     │         │
│  │  CLAUDE.md  │  │  CLAUDE.md  │  │  CLAUDE.md  │  │  CLAUDE.md  │         │
│  │ MEMORIES.md │  │ MEMORIES.md │  │ MEMORIES.md │  │ MEMORIES.md │         │
│  │ .fleet/     │  │ .fleet/     │  │             │  │             │         │
│  │ projects.json  │ projects.json  │ (single)    │  │ (single)    │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          └────────────────┴────────────────┴────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────────┐
│     Knowledge Sync Agent        │    │        Fleet DB (SQLite)            │
│  FLEET_ROLE=knowledge_sync      │    │   briefings, outbox_events          │
│                                 │    │   kb_sync_state (new table)         │
│  Trigger: Manual only           │    └────────────────┬────────────────────┘
│  Full: --full flag              │                     │
│                                 │◄────────────────────┘
│  1. git diff <commit>..HEAD     │    (query 14-day briefings)
│  2. Read changed docs           │
│  3. Sonnet: distill + provenance│
│  4. Write KB with frontmatter   │
└────────────────┬────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              Commander Knowledge Base (~/.claude/commander/knowledge/)        │
│                                                                               │
│  knowledge/                                                                   │
│  ├── aliases.json        # Auto-generated + manual overrides                 │
│  ├── index.md            # Fleet overview (full artifact, not injected raw)  │
│  │                                                                            │
│  ├── mvp__abc123/        # Canonical project_id as directory name            │
│  │   ├── summary.md      # YAML frontmatter: schema, updated_at, sources     │
│  │   ├── architecture.md #                                                    │
│  │   ├── business-logic.md                                                    │
│  │   ├── known-issues.md #                                                    │
│  │   ├── activity.md     # Reality layer (70% weight): 14-day briefings      │
│  │   └── changelog.md    # Rolling 30-day + monthly rollups                   │
│  │                                                                            │
│  └── by-name/            # Symlinks for shell navigation                      │
│      ├── mvp -> ../mvp__abc123                                                │
│      └── mimesis -> ../mimesis__607a7a7c                                      │
└──────────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Fleet Commander (Opus)                                │
│                                                                               │
│  SessionStart hook → inject thin KB header (not full index.md)               │
│  /kb <project> → print summary + activity + pointers                          │
│  /improve <project> → KB + live 14-day briefings + optional code deep-dive   │
│  Output: 5-7 suggestions, markdown with evidence, reality-heavy               │
└──────────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Commander UI (Full KB Panel)                          │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Knowledge Base                                              [Sync Now] │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │  Project        │ Last Sync    │ Status    │ Briefings │ Actions       │ │
│  │  mvp            │ 2 days ago   │ Fresh     │ 47        │ [View] [Sync] │ │
│  │  mimesis        │ 8 days ago   │ ⚠️ Stale  │ 23        │ [View] [Sync] │ │
│  │  api-svc        │ Never        │ ❌ None   │ 12        │ [Sync]        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. Knowledge Base Directory Structure

Location: `~/.claude/commander/knowledge/`

```
knowledge/
├── aliases.json                # Auto-generated + manual overrides
│   {
│     "mvp": "mvp__abc123",
│     "mimesis": "mimesis__607a7a7c",
│     "frontend": "frontend__0f19c2a1",
│     "_manual_overrides": {
│       "onboarding": "mvp__abc123"  # Custom alias
│     }
│   }
│
├── index.md                    # Fleet overview (full artifact, read on demand)
│
├── by-name/                    # Symlinks for shell navigation
│   ├── mvp -> ../mvp__abc123
│   └── mimesis -> ../mimesis__607a7a7c
│
├── <project_id>/               # Per-project knowledge (canonical ID)
│   │
│   ├── summary.md              # YAML frontmatter + distilled content
│   │   ---
│   │   schema: knowledge.v1
│   │   project_id: mvp__abc123
│   │   updated_at: 2026-01-13T02:01:00Z
│   │   sync_type: incremental | full
│   │   source_commits: [def4567, 9912abc]
│   │   source_files:
│   │     - docs/index.md
│   │     - CLAUDE.md
│   │   ---
│   │   # Summary
│   │   ...content...
│   │
│   ├── architecture.md         # Tech stack, patterns, integration points
│   ├── business-logic.md       # Domain rules, entities, workflows
│   ├── known-issues.md         # Gotchas, tech debt, deferred decisions
│   │
│   ├── activity.md             # REALITY LAYER (70% weight)
│   │   ---
│   │   schema: activity.v1
│   │   project_id: mvp__abc123
│   │   generated_at: 2026-01-13T02:01:00Z
│   │   briefing_window: 14d
│   │   briefing_count: 47
│   │   ---
│   │   # Recent Activity Summary (14 days)
│   │
│   │   ## Top Changed Areas
│   │   - src/auth/: 12 sessions, 8 major changes
│   │   - docs/api.md: flagged for drift 3 times
│   │
│   │   ## Recurring Blockers
│   │   - CI flakiness in integration tests (blocked 5 sessions)
│   │
│   │   ## Operational Patterns
│   │   - Heavy refactoring week (Jan 8-12)
│   │   - doc_drift_high: 2 occurrences
│   │
│   └── changelog.md            # Rolling 30-day + monthly rollups
│
└── sync-state.json             # Deprecated: moved to SQLite kb_sync_state
```

### 2. Project Identity & Alias Resolution

**Problem**: `project_id = repo_name__hash` is unique but unfriendly. `/improve mvp` should work.

**Solution**: Multi-tier resolution with auto-generation + manual overrides.

```python
def resolve_project(input_name: str) -> str:
    """Resolve human input to canonical project_id."""
    aliases_data = load_json("~/.claude/commander/knowledge/aliases.json")

    # Extract auto aliases and manual overrides
    manual_overrides = aliases_data.pop("_manual_overrides", {})
    auto_aliases = aliases_data

    # Combined aliases (manual takes precedence)
    all_aliases = {**auto_aliases, **manual_overrides}

    projects = list_kb_directories()

    # 1. Exact project_id match
    if input_name in projects:
        return input_name

    # 2. Alias match (manual overrides checked first via dict merge)
    if input_name in all_aliases:
        return all_aliases[input_name]

    # 3. Unique repo_name match (if only one project has this name)
    matches = [p for p in projects if p.startswith(f"{input_name}__")]
    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        raise AmbiguousProjectError(f"Multiple projects match '{input_name}': {matches}")

    # 4. Fuzzy match with disambiguation
    fuzzy = fuzzy_match(input_name, list(all_aliases.keys()) + projects)
    if fuzzy:
        raise SuggestionError(f"Did you mean: {fuzzy}?")

    raise ProjectNotFoundError(f"Project '{input_name}' not found in knowledge base")


def regenerate_aliases():
    """Auto-generate aliases from repo names, preserving manual overrides."""
    aliases_path = KNOWLEDGE_DIR / "aliases.json"

    # Load existing to preserve manual overrides
    existing = {}
    if aliases_path.exists():
        existing = json.loads(aliases_path.read_text())

    manual_overrides = existing.pop("_manual_overrides", {})

    # Generate new auto-aliases
    auto_aliases = {}
    conflicts = []

    for project_dir in list_kb_directories():
        repo_name = project_dir.split("__")[0]

        if repo_name in auto_aliases:
            # Conflict: same repo name, different hash
            conflicts.append((repo_name, project_dir, auto_aliases[repo_name]))
        else:
            auto_aliases[repo_name] = project_dir

    # Warn about conflicts
    for repo_name, new_id, existing_id in conflicts:
        log.warn(f"Alias conflict: '{repo_name}' -> {existing_id} (keeping), {new_id} (skipped)")

    # Write back with manual overrides preserved
    output = {**auto_aliases, "_manual_overrides": manual_overrides}
    aliases_path.write_text(json.dumps(output, indent=2))

    # Regenerate symlinks
    regenerate_symlinks(auto_aliases)
```

### 3. Automation Role Isolation

**Problem**: Sync agent runs `claude -p` which can trigger normal hooks, polluting the fleet.

**Solution**: `FLEET_ROLE` environment variable checked by all hooks.

```python
# In daemon job-runner.ts when spawning sync
env = {
    ...process.env,
    "FLEET_ROLE": "knowledge_sync",
    "FLEET_AUTOMATION": "true"
}
```

```python
# In every hook (init-status-v5.py, stop-validator.py, etc.)
import os

FLEET_ROLE = os.environ.get("FLEET_ROLE", "")

# Short-circuit for automation runs
if FLEET_ROLE in ("knowledge_sync", "scheduled_job"):
    sys.exit(0)
```

**Allowed emissions per role**:

| Role | status.v5 | Briefings | Timeline | Outbox Events |
|------|-----------|-----------|----------|---------------|
| `knowledge_sync` | ❌ | ❌ | ❌ | ✅ `knowledge_sync_completed` (summary only) |
| `scheduled_job` | ❌ | ❌ | ❌ | ✅ `job_completed` |
| (none/normal) | ✅ | ✅ | ✅ | ✅ |

### 4. Knowledge Sync Agent

**Trigger**: Manual only via `/knowledge-sync` command

**Full re-distill**: Manual flag `--full` (no automatic weekly trigger)

**Implementation**: Headless `claude -p` invoked from the command

```bash
# Set automation role to prevent hook pollution
FLEET_ROLE=knowledge_sync \
claude -p "Run /knowledge-sync" \
  --allowedTools "Read,Glob,Grep,Bash(git *)" \
  --dangerously-skip-permissions \
  --output-format json
```

**Git Commands**:

```bash
# Incremental: changes since last synced commit
git diff --name-only <lastCommitSeen>..HEAD -- docs/ CLAUDE.md .claude/MEMORIES.md

# Initial scan (no lastCommitSeen): list all tracked files
git ls-files -- docs/ CLAUDE.md .claude/MEMORIES.md

# Get current HEAD for storing
git rev-parse HEAD
```

**Sync Algorithm**:

```python
# Pseudocode for knowledge-sync

def knowledge_sync(force_full: bool = False, project_filter: str = None):
    synced_count = 0
    skipped_count = 0

    for project in fleet_db.get_active_projects():
        # Optional filter
        if project_filter and not matches(project, project_filter):
            continue

        repo_root = project.repo_root
        branch = project.branch or "main"

        # Check for .fleet/projects.json (monorepo support)
        fleet_manifest = repo_root / ".fleet" / "projects.json"
        if fleet_manifest.exists():
            sub_projects = json.loads(fleet_manifest.read_text())
            for sub in sub_projects:
                sync_single_project(sub, repo_root, branch, force_full)
                synced_count += 1
        else:
            result = sync_single_project(project, repo_root, branch, force_full)
            if result == "synced":
                synced_count += 1
            else:
                skipped_count += 1

    # Regenerate index.md and aliases.json
    regenerate_fleet_index()
    regenerate_aliases()

    # Emit summary event only
    emit_outbox_event("knowledge_sync_completed", {
        "projects_synced": synced_count,
        "projects_skipped": skipped_count
    })


def sync_single_project(project, repo_root, branch, force_full):
    # Ensure we're on the right branch
    current_branch = git_current_branch(repo_root)
    if current_branch != branch:
        log(f"Skipping {project.id}: on {current_branch}, expected {branch}")
        return "skipped"

    sync_state = kb_sync_state.get(project.id, branch)
    last_commit = sync_state.last_commit_seen if sync_state else None

    is_full_sync = force_full or sync_state is None

    if is_full_sync:
        doc_files = git_ls_files(repo_root, get_doc_paths(project))
    else:
        doc_files = git_diff_names(repo_root, last_commit, "HEAD", get_doc_paths(project))
        if not doc_files:
            return "skipped"

    # Read doc contents
    doc_contents = {}
    for file in doc_files:
        doc_contents[file] = read_file(repo_root / file)

    # Query 14-day briefings for reality layer
    briefings = fleet_db.get_briefings(
        project_id=project.id,
        since=datetime.now() - timedelta(days=14),
        limit=50
    )

    # Distill knowledge (Sonnet call)
    distilled = sonnet_distill(
        project_id=project.id,
        project_name=project.repo_name,
        sync_type="full" if is_full_sync else "incremental",
        source_files=doc_files,
        source_commits=[last_commit, git_head(repo_root)] if last_commit else [git_head(repo_root)],
        doc_contents=doc_contents,
        briefings=briefings,
        existing_knowledge=read_existing_knowledge(project.id) if not is_full_sync else None
    )

    # Write knowledge files with provenance frontmatter
    write_knowledge_with_provenance(project.id, distilled)

    # Update sync state in SQLite
    kb_sync_state.upsert(project.id, branch, {
        "last_commit_seen": git_head(repo_root),
        "last_sync_at": now(),
        "sync_type": "full" if is_full_sync else "incremental",
        "files_processed": len(doc_files)
    })

    return "synced"
```

### 5. Monorepo Support (Required)

For repos with multiple logical projects, add `.fleet/projects.json`:

```json
[
  {
    "project_id": "api__1234abcd",
    "name": "api",
    "doc_paths": ["services/api/docs", "services/api/CLAUDE.md"],
    "memories_path": "services/api/.claude/MEMORIES.md"
  },
  {
    "project_id": "web__5678efgh",
    "name": "web",
    "doc_paths": ["apps/web/docs", "apps/web/CLAUDE.md"],
    "memories_path": "apps/web/.claude/MEMORIES.md"
  }
]
```

Sync agent detects this file and processes each entry as a separate project with its own KB directory.

### 6. Sonnet Distillation Prompt

```markdown
You are a knowledge distiller for the Commander system. Given documentation from
project "{project_id}" ({project_name}), extract and update the knowledge base.

## Input
- Sync type: {sync_type} (incremental or full)
- Source files and their contents
- Source commits for provenance
- Recent briefings (last 14 days) for activity layer
- Existing knowledge base (for incremental only)

## Output Structure (JSON)
{
  "summary_md": {
    "content": "Full summary.md content with stable sections",
    "sources": [{"path": "...", "commit": "..."}]
  } | null,

  "architecture_md": {
    "content": "Architecture distillation",
    "sources": [...]
  } | null,

  "business_logic_md": {
    "content": "Business logic distillation",
    "sources": [...]
  } | null,

  "known_issues_md": {
    "content": "Known issues from MEMORIES.md",
    "sources": [...]
  } | null,

  "activity_md": {
    "content": "Reality layer: summary stats + patterns from briefings",
    "briefing_ids": [1234, 1235]
  },

  "changelog_entry": "What changed and why (append to changelog.md)",

  "index_summary": "1-2 sentence summary for index.md"
}

## Guidelines

### Content Extraction
- Extract WHAT the project does, not HOW it's implemented
- Focus on business goals, user value, strategic priorities
- Identify decision points and trade-offs made
- Note technical debt and improvement opportunities
- Keep summaries scannable (bullet points, headers)

### Section Stability
- Use consistent headings across all projects
- For incremental: return null for unchanged sections (keeps existing)
- For full: return all sections with complete content

### Activity Layer (from briefings) - 14-day window
Generate activity.md with summary stats + patterns:
- Top changed areas (files/directories with most session activity)
- Recurring blockers (issues that blocked multiple sessions)
- doc_drift_high occurrences
- Operational patterns (heavy refactoring periods, stability periods)

### Assumptions & Unknowns
Include an "## Assumptions" section listing:
- Inferred facts that may need verification
- Ambiguous decisions
- Things that seem important but weren't explicitly stated
```

### 7. Commander Context Injection (Thin Header)

```python
#!/usr/bin/env python3
"""
SessionStart hook for Commander.
Injects thin KB header, not full index.
"""
import json
import os
import sys
from pathlib import Path

KNOWLEDGE_DIR = Path.home() / ".claude" / "commander" / "knowledge"

def main():
    input_data = json.load(sys.stdin)
    cwd = input_data.get("cwd", "")

    # Short-circuit for automation
    if os.environ.get("FLEET_ROLE"):
        sys.exit(0)

    if "commander" not in cwd.lower():
        sys.exit(0)

    index_path = KNOWLEDGE_DIR / "index.md"
    aliases_path = KNOWLEDGE_DIR / "aliases.json"

    if not index_path.exists():
        print("<system-reminder>\nKnowledge base not initialized. Run /knowledge-sync first.\n</system-reminder>")
        sys.exit(0)

    projects = list_kb_projects()
    stale_projects = [p for p in projects if is_stale(p, days=7)]

    header = f"""<system-reminder>
## Fleet Knowledge Base

**Projects**: {len(projects)} | **Stale (>7d)**: {len(stale_projects)} | **Last sync**: {get_last_sync_time()}

### Alerts
{format_staleness_alerts(stale_projects) if stale_projects else "None"}

### Commands
- `/kb <project>` — View project knowledge summary
- `/improve <project>` — Generate 5-7 improvement suggestions (reality-heavy)
- `/knowledge-sync [--full]` — Update knowledge base

Read detailed KB: `~/.claude/commander/knowledge/<project_id>/`
</system-reminder>"""

    print(header)
    sys.exit(0)

if __name__ == "__main__":
    main()
```

### 8. `/improve` Command

Location: `~/.claude/commands/improve.md`

```markdown
---
description: Suggest 5-7 high-leverage improvements based on operational reality + docs
---

# /improve <project_name>

Analyze the specified project and suggest high-leverage improvements grounded in
operational reality (70%) with docs as supporting context (30%).

## Process

1. **Resolve Project**
   - Try exact project_id, then alias, then unique repo_name match
   - If ambiguous, list matches and ask for clarification
   - **Staleness check**: if KB is >7 days old, warn and offer to sync first (but proceed)

2. **Load Two-Layer Knowledge**

   **Reality Layer (70% weight)**:
   - activity.md (briefing-derived insights)
   - Query Fleet DB for last 14 days of raw briefings (live query)
   - doc_drift_high occurrences
   - Recurring blockers

   **Intent Layer (30% weight)** (from `~/.claude/commander/knowledge/<project>/`):
   - summary.md (business context, goals)
   - architecture.md (technical landscape)
   - business-logic.md (domain rules)
   - known-issues.md (tech debt, gotchas, assumptions)
   - changelog.md (recent doc changes)

3. **Optional Code Deep-Dive**
   If a suggestion requires code-level analysis, offer to read specific source files.
   Default: KB only for speed. User can request code scan for specific suggestions.

4. **First-Principles Analysis**
   Re-assess from first principles:
   - What problem does this solve?
   - Who are the users and what do they need?
   - What are the core value propositions?
   - What constraints exist?

5. **Cross-Reference Reality vs Intent**
   - Where does operational activity contradict stated goals?
   - What areas get constant attention but aren't in "priorities"?
   - What assumptions are being invalidated by reality?

6. **Identify Improvement Opportunities**

   ### New Features
   - Capabilities that would deliver outsized user value
   - Adjacent problems this could solve
   - Integrations that would multiply value

   ### Technical Improvements
   - Performance optimizations with high ROI
   - Reliability/resilience (especially recurring blockers)
   - Developer experience (based on session friction)
   - Security hardening opportunities

   ### Business Logic Refinements
   - Simplifications that preserve intent
   - Edge cases worth handling
   - Assumptions worth revisiting (flagged in known-issues)

   ### Strategic Refactors
   - Technical debt with compounding cost (from activity patterns)
   - Architecture pivots worth considering
   - Abstractions that would pay dividends

7. **Prioritize by Leverage**
   Output 5-7 suggestions ranked by: (Impact × Confidence) / Effort

   Ground confidence in evidence:
   - "Based on 12 sessions touching auth/ last week..."
   - "doc_drift_high flagged 3 times for API docs..."

## Output Format

```markdown
# Improvement Suggestions for {project_name}

**Knowledge freshness**: {days since sync} days {⚠️ if >7} | **Briefing window**: 14 days | **Sessions analyzed**: {count}

## Executive Summary
{1-2 paragraph overview of project state and key opportunities, grounded in operational data}

## High-Leverage Improvements

### 1. [Category] {Suggestion Title}
**Impact**: High/Medium/Low
**Effort**: Days/Weeks/Months
**Confidence**: High/Medium/Low
**Evidence**: {Brief citation of briefing/doc data}

{Description of the improvement and why it matters}

**Implementation Notes**:
- {Key consideration 1}
- {Key consideration 2}

### 2. ...
(5-7 total suggestions)

---

*Want code-level analysis for any suggestion? Ask: "deep-dive on suggestion N"*
```
```

### 9. `/kb` Command

Location: `~/.claude/commands/kb.md`

```markdown
---
description: View project knowledge summary
---

# /kb <project_name>

Print the knowledge base summary for a project.

## Process

1. Resolve project name to project_id (alias resolution)
2. Read summary.md and activity.md
3. Print inline with pointers to other files

## Output

```markdown
# {project_name} Knowledge Base

**Last synced**: {date} | **Sync type**: {incremental/full} | **14-day briefings**: {count}

## Summary
{contents of summary.md, truncated to ~500 words}

## Recent Activity (14 days)
{contents of activity.md}

---

**More details**:
- Architecture: `~/.claude/commander/knowledge/{project_id}/architecture.md`
- Business Logic: `~/.claude/commander/knowledge/{project_id}/business-logic.md`
- Known Issues: `~/.claude/commander/knowledge/{project_id}/known-issues.md`
- Changelog: `~/.claude/commander/knowledge/{project_id}/changelog.md`
```
```

### 10. SQLite Schema Addition

Add `kb_sync_state` table to Fleet DB:

```sql
CREATE TABLE kb_sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    last_commit_seen TEXT,
    last_sync_at TEXT NOT NULL,
    sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental')),
    files_processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(project_id, branch)
);

CREATE INDEX idx_kb_sync_state_project ON kb_sync_state(project_id);
CREATE INDEX idx_kb_sync_state_stale ON kb_sync_state(last_sync_at);
```

Drizzle schema:

```typescript
// packages/daemon/src/fleet-db/schema.ts

export const kbSyncState = sqliteTable("kb_sync_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull(),
  branch: text("branch").notNull().default("main"),
  lastCommitSeen: text("last_commit_seen"),
  lastSyncAt: text("last_sync_at").notNull(),
  syncType: text("sync_type", { enum: ["full", "incremental"] }).notNull(),
  filesProcessed: integer("files_processed").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  projectBranchUnique: unique().on(table.projectId, table.branch),
}));
```

### 11. Security (Minimal)

Per configuration, security is minimal:

```bash
# Only requirement: restrict KB directory permissions
chmod 700 ~/.claude/commander/knowledge
```

No doc redaction, no per-project policies. Trust the docs.

### 12. Commander UI: KB Panel

Full panel showing project list + freshness + sync button:

```typescript
// packages/ui/src/components/commander/KBPanel.tsx

interface KBProject {
  projectId: string;
  name: string;  // From aliases
  lastSyncAt: string | null;
  syncType: 'full' | 'incremental' | null;
  briefingCount: number;
  isStale: boolean;  // >7 days
}

function KBPanel() {
  const { projects, triggerSync } = useKBState();

  return (
    <div className="kb-panel">
      <div className="kb-header">
        <h3>Knowledge Base</h3>
        <Button onClick={() => triggerSync()}>Sync All</Button>
      </div>

      <table className="kb-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Last Sync</th>
            <th>Status</th>
            <th>Briefings</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.projectId}>
              <td>{p.name}</td>
              <td>{formatRelativeTime(p.lastSyncAt)}</td>
              <td>
                {p.lastSyncAt === null ? '❌ None' :
                 p.isStale ? '⚠️ Stale' : '✓ Fresh'}
              </td>
              <td>{p.briefingCount}</td>
              <td>
                {p.lastSyncAt && <Button size="sm">View</Button>}
                <Button size="sm" onClick={() => triggerSync(p.projectId)}>Sync</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Implementation Plan

### Phase 1: Foundation & Guards (Priority)

1. **Add `FLEET_ROLE` environment variable handling**
   - Modify daemon job-runner to set env when spawning automation
   - Update all hooks to check and short-circuit
   - Files: `~/.claude/hooks/*.py`

2. **Add `kb_sync_state` SQLite table**
   - Drizzle schema + migration
   - Basic CRUD operations
   - Files: `packages/daemon/src/fleet-db/schema.ts`

3. **Create knowledge directory structure**
   ```bash
   mkdir -p ~/.claude/commander/knowledge/by-name
   echo '{"_manual_overrides": {}}' > ~/.claude/commander/knowledge/aliases.json
   chmod 700 ~/.claude/commander/knowledge
   ```

### Phase 2: Sync Agent

1. **Create `/knowledge-sync` command**
   - Project resolution with aliases
   - Monorepo support (.fleet/projects.json)
   - Git diff with commit ranges
   - `--full` flag for full re-distill
   - Files: `~/.claude/commands/knowledge-sync.md`

2. **Implement Sonnet distillation**
   - Headless `claude -p` invocation
   - JSON output parsing
   - Provenance frontmatter writing
   - Activity layer from 14-day briefings

3. **Auto-generate aliases + symlinks**
   - Conflict detection and warnings
   - Preserve manual overrides

### Phase 3: Context & Commands

1. **Create thin SessionStart hook**
   - KB header injection (not full index)
   - Staleness alerts (>7 days)
   - Files: `~/.claude/hooks/commander-knowledge-inject.py`

2. **Create `/kb` command**
   - Project resolution
   - Print summary + activity + pointers
   - Files: `~/.claude/commands/kb.md`

3. **Create `/improve` command**
   - Reality-heavy (70/30) weighting
   - KB + live 14-day DB query
   - Optional code deep-dive
   - 5-7 suggestions with evidence
   - Files: `~/.claude/commands/improve.md`

### Phase 4: UI Integration

1. **Add KB Panel to Commander UI**
   - Project list with freshness
   - Sync button per project
   - Stale/Fresh/None status badges
   - Files: `packages/ui/src/components/commander/KBPanel.tsx`

2. **Add API endpoint for KB state**
   - GET /api/v1/kb/projects
   - POST /api/v1/kb/sync/:projectId
   - Files: `packages/daemon/src/routes/kb.ts`

3. **Wire up outbox event display**
   - Show `knowledge_sync_completed` in Commander timeline
   - Files: `packages/ui/src/components/commander/EventTicker.tsx`

---

## Comprehensive Implementation Checklist

### Phase 1: Foundation & Guards

#### 1.1 FLEET_ROLE Environment Variable Isolation
- [ ] **Create `FLEET_ROLE` constant definitions**
  - File: `packages/daemon/src/constants.ts`
  - Define: `FLEET_ROLES = { KNOWLEDGE_SYNC: 'knowledge_sync', SCHEDULED_JOB: 'scheduled_job' }`

- [ ] **Update `init-status-v5.py` hook**
  - File: `~/.claude/hooks/init-status-v5.py`
  - Add: Check `os.environ.get("FLEET_ROLE")` at top
  - Add: `if FLEET_ROLE in ("knowledge_sync", "scheduled_job"): sys.exit(0)`

- [ ] **Update `status-working.py` hook**
  - File: `~/.claude/hooks/status-working.py`
  - Add: Same FLEET_ROLE guard pattern

- [ ] **Update `stop-validator.py` hook**
  - File: `~/.claude/hooks/stop-validator.py`
  - Add: Same FLEET_ROLE guard pattern

- [ ] **Update `finalize-status-v5.py` hook**
  - File: `~/.claude/hooks/finalize-status-v5.py`
  - Add: Same FLEET_ROLE guard pattern

- [ ] **Update `ingest-status-v5.py` hook**
  - File: `~/.claude/hooks/ingest-status-v5.py`
  - Add: Same FLEET_ROLE guard pattern

- [ ] **Update `fleet-forward-hook-event.py` hook**
  - File: `~/.claude/hooks/fleet-forward-hook-event.py`
  - Add: Same FLEET_ROLE guard pattern

- [ ] **Update `read-docs-trigger.py` hook**
  - File: `~/.claude/hooks/read-docs-trigger.py`
  - Add: Same FLEET_ROLE guard pattern

- [ ] **Update `skill-reminder.py` hook**
  - File: `~/.claude/hooks/skill-reminder.py`
  - Add: Same FLEET_ROLE guard pattern

#### 1.2 SQLite Schema: kb_sync_state Table
- [ ] **Add Drizzle schema for kb_sync_state**
  - File: `packages/daemon/src/fleet-db/schema.ts`
  - Add: `kbSyncState` table with columns: id, projectId, branch, lastCommitSeen, lastSyncAt, syncType, filesProcessed, createdAt, updatedAt
  - Add: Unique constraint on (projectId, branch)
  - Add: Indexes on projectId and lastSyncAt

- [ ] **Create Drizzle migration**
  - Run: `cd packages/daemon && pnpm drizzle-kit generate:sqlite`
  - Verify migration file created in `drizzle/`

- [ ] **Add kb_sync_state CRUD operations**
  - File: `packages/daemon/src/fleet-db/kb-sync-state.ts` (new)
  - Add: `getSyncState(projectId: string, branch: string)`
  - Add: `upsertSyncState(projectId, branch, data)`
  - Add: `getAllSyncStates()`
  - Add: `getStaleProjects(daysOld: number)`

- [ ] **Export kb_sync_state from fleet-db index**
  - File: `packages/daemon/src/fleet-db/index.ts`
  - Add: Export new CRUD operations

#### 1.3 Knowledge Directory Structure
- [ ] **Create setup script for KB directory**
  - File: `scripts/setup-kb-directory.sh` (new)
  - Commands:
    ```bash
    mkdir -p ~/.claude/commander/knowledge/by-name
    echo '{"_manual_overrides": {}}' > ~/.claude/commander/knowledge/aliases.json
    chmod 700 ~/.claude/commander/knowledge
    ```

- [ ] **Add KB directory constants**
  - File: `packages/daemon/src/constants.ts`
  - Add: `KNOWLEDGE_DIR = path.join(os.homedir(), '.claude', 'commander', 'knowledge')`
  - Add: `ALIASES_FILE = path.join(KNOWLEDGE_DIR, 'aliases.json')`

- [ ] **Create KB directory validation utility**
  - File: `packages/daemon/src/knowledge/ensure-kb-dir.ts` (new)
  - Add: Function to check/create directory structure on daemon startup

---

### Phase 2: Sync Agent

#### 2.1 /knowledge-sync Command
- [ ] **Create command file**
  - File: `~/.claude/commands/knowledge-sync.md` (new)
  - Add: YAML frontmatter with description
  - Add: Full command instructions from plan section 4

- [ ] **Implement project discovery**
  - Within command: Query Fleet DB for active projects
  - Add: Filter by optional project argument

- [ ] **Implement monorepo detection**
  - Within command: Check for `.fleet/projects.json` in repo root
  - Add: Parse and iterate sub-projects if exists

- [ ] **Implement --full flag handling**
  - Within command: Parse flag from args
  - Add: Skip incremental logic when --full is set

#### 2.2 Git Operations
- [ ] **Create git helper functions**
  - File: `~/.claude/commands/knowledge-sync.md` (inline bash)
  - Add: `git diff --name-only <lastCommit>..HEAD -- docs/ CLAUDE.md .claude/MEMORIES.md`
  - Add: `git ls-files -- docs/ CLAUDE.md .claude/MEMORIES.md`
  - Add: `git rev-parse HEAD`
  - Add: `git branch --show-current`

- [ ] **Add branch validation**
  - Check: Current branch matches expected branch from project record
  - Behavior: Skip project with warning if branch mismatch

#### 2.3 Sonnet Distillation
- [ ] **Create distillation prompt template**
  - File: `~/.claude/commander/prompts/distill-knowledge.md` (new)
  - Content: Full Sonnet prompt from plan section 6

- [ ] **Create JSON schema for distillation output**
  - File: `~/.claude/commander/schemas/distillation-output.json` (new)
  - Define: Structure for summary_md, architecture_md, business_logic_md, known_issues_md, activity_md, changelog_entry, index_summary

- [ ] **Implement headless claude -p invocation**
  - Within command: Spawn `claude -p` with:
    - `FLEET_ROLE=knowledge_sync` environment
    - `--allowedTools "Read,Glob,Grep,Bash(git *)"`
    - `--dangerously-skip-permissions`
    - `--output-format json`

- [ ] **Implement JSON response parsing**
  - Within command: Parse Sonnet's JSON output
  - Validate against schema
  - Handle null values for unchanged sections

#### 2.4 Knowledge File Writing
- [ ] **Create write_knowledge_with_provenance function**
  - Within command: Write each .md file with YAML frontmatter
  - Add: schema, project_id, updated_at, sync_type, source_commits, source_files

- [ ] **Implement summary.md writing**
  - Path: `~/.claude/commander/knowledge/<project_id>/summary.md`
  - Content: Provenance frontmatter + distilled summary

- [ ] **Implement architecture.md writing**
  - Path: `~/.claude/commander/knowledge/<project_id>/architecture.md`
  - Content: Provenance frontmatter + architecture content

- [ ] **Implement business-logic.md writing**
  - Path: `~/.claude/commander/knowledge/<project_id>/business-logic.md`
  - Content: Provenance frontmatter + business logic content

- [ ] **Implement known-issues.md writing**
  - Path: `~/.claude/commander/knowledge/<project_id>/known-issues.md`
  - Content: Provenance frontmatter + issues from MEMORIES.md

- [ ] **Implement activity.md writing (Reality Layer)**
  - Path: `~/.claude/commander/knowledge/<project_id>/activity.md`
  - Content: Activity frontmatter + 14-day briefing analysis
  - Include: briefing_window, briefing_count, generated_at

- [ ] **Implement changelog.md appending**
  - Path: `~/.claude/commander/knowledge/<project_id>/changelog.md`
  - Behavior: Append new entry, maintain 30-day rolling window

#### 2.5 Alias & Symlink Management
- [ ] **Implement regenerate_aliases function**
  - Within command: Scan KB directories
  - Extract repo_name from `<repo>__<hash>` format
  - Detect conflicts (same name, different hash)
  - Preserve `_manual_overrides` section
  - Write updated aliases.json

- [ ] **Implement regenerate_symlinks function**
  - Within command: Remove existing symlinks in `by-name/`
  - Create new symlinks: `by-name/<name> -> ../<project_id>`

- [ ] **Add conflict warning output**
  - When: Same repo_name appears with different hashes
  - Output: Warning message listing conflicting projects

#### 2.6 Index Generation
- [ ] **Implement regenerate_fleet_index function**
  - Within command: Generate `~/.claude/commander/knowledge/index.md`
  - Content: Fleet overview with all project summaries
  - Include: Project count, last sync times, quick navigation

#### 2.7 Sync State Updates
- [ ] **Update kb_sync_state on successful sync**
  - Call: `upsertSyncState(projectId, branch, { lastCommitSeen, lastSyncAt, syncType, filesProcessed })`

- [ ] **Emit knowledge_sync_completed outbox event**
  - Payload: `{ projects_synced: N, projects_skipped: M }`
  - Note: Only summary event, no per-project events

---

### Phase 3: Context & Commands

#### 3.1 Commander SessionStart Hook (Thin Header)
- [ ] **Create commander-knowledge-inject.py hook**
  - File: `~/.claude/hooks/commander-knowledge-inject.py` (new)
  - Trigger: SessionStart
  - Check: `if "commander" not in cwd.lower(): sys.exit(0)`
  - Check: FLEET_ROLE guard

- [ ] **Implement KB header generation**
  - Count: Total projects in KB
  - Count: Stale projects (>7 days)
  - Format: Compact system-reminder block

- [ ] **Add staleness alerts**
  - List: Projects with lastSyncAt > 7 days ago
  - Format: Warning lines in header

- [ ] **Register hook in settings.json**
  - File: `~/.claude/settings.json`
  - Add: Hook entry for SessionStart trigger

#### 3.2 /kb Command
- [ ] **Create command file**
  - File: `~/.claude/commands/kb.md` (new)
  - Add: YAML frontmatter with description

- [ ] **Implement project resolution**
  - Try: Exact project_id match
  - Try: Alias lookup
  - Try: Unique repo_name prefix match
  - Error: Ambiguous or not found

- [ ] **Implement summary output**
  - Read: summary.md (truncate to ~500 words)
  - Read: activity.md
  - Print: Inline with file path pointers

#### 3.3 /improve Command
- [ ] **Create command file**
  - File: `~/.claude/commands/improve.md` (new)
  - Add: YAML frontmatter with description
  - Add: Full process from plan section 8

- [ ] **Implement staleness check**
  - Check: lastSyncAt > 7 days
  - Action: Warn but proceed (per configuration)

- [ ] **Implement two-layer loading**
  - Reality (70%): Read activity.md + query live 14-day briefings
  - Intent (30%): Read summary, architecture, business-logic, known-issues, changelog

- [ ] **Implement live briefing query**
  - Query: Fleet DB for briefings WHERE project_id = X AND created_at > 14 days ago
  - Return: Raw briefing data for analysis

- [ ] **Implement first-principles analysis prompts**
  - Add: Questions about problem, users, value, constraints

- [ ] **Implement improvement identification**
  - Categories: New Features, Technical Improvements, Business Logic, Strategic Refactors
  - Output: 5-7 suggestions

- [ ] **Implement leverage-based prioritization**
  - Formula: (Impact × Confidence) / Effort
  - Evidence: Cite briefing/doc data for confidence

- [ ] **Implement output format**
  - Header: Knowledge freshness, briefing window, session count
  - Executive summary: 1-2 paragraphs
  - Suggestions: Numbered with Impact/Effort/Confidence/Evidence

- [ ] **Add deep-dive capability**
  - Prompt: "Want code-level analysis? Ask: deep-dive on suggestion N"
  - Behavior: Read source files when requested

---

### Phase 4: UI Integration

#### 4.1 KB API Endpoints
- [ ] **Create KB routes file**
  - File: `packages/daemon/src/routes/kb.ts` (new)
  - Framework: Hono router

- [ ] **Implement GET /api/v1/kb/projects**
  - Return: Array of KBProject objects
  - Include: projectId, name (alias), lastSyncAt, syncType, briefingCount, isStale

- [ ] **Implement POST /api/v1/kb/sync/:projectId**
  - Action: Trigger sync for specific project
  - Param: Optional `?full=true` for full re-distill
  - Return: Job ID or sync result

- [ ] **Register KB routes in main app**
  - File: `packages/daemon/src/index.ts`
  - Add: `app.route('/api/v1/kb', kbRoutes)`

#### 4.2 KB Panel Component
- [ ] **Create KBPanel component**
  - File: `packages/ui/src/components/commander/KBPanel.tsx` (new)
  - Structure: Header with title + Sync All button, table of projects

- [ ] **Create useKBState hook**
  - File: `packages/ui/src/hooks/useKBState.ts` (new)
  - State: projects array, loading state
  - Actions: fetchProjects, triggerSync

- [ ] **Implement project list table**
  - Columns: Project, Last Sync, Status, Briefings, Actions
  - Status badges: ✓ Fresh, ⚠️ Stale, ❌ None

- [ ] **Implement sync buttons**
  - Per-project: Sync single project
  - Global: Sync All button in header

- [ ] **Implement View action**
  - Behavior: Navigate to project KB detail or open in modal

- [ ] **Add CSS styles**
  - File: `packages/ui/src/styles/components/kb-panel.css` (new)
  - Styles: Table layout, status badges, action buttons

#### 4.3 Commander UI Integration
- [ ] **Add KB Panel to Commander view**
  - File: `packages/ui/src/routes/commander.tsx`
  - Location: Sidebar or dedicated tab

- [ ] **Add KB Panel toggle/tab**
  - UI: Tab or collapsible panel for KB visibility

#### 4.4 Event Display
- [ ] **Update EventTicker for knowledge_sync_completed**
  - File: `packages/ui/src/components/commander/EventTicker.tsx`
  - Add: Handler for `knowledge_sync_completed` event type
  - Display: "Synced N projects, skipped M"

---

### Phase 5: Testing & Validation

#### 5.1 Manual Testing Checklist
- [ ] **Test FLEET_ROLE isolation**
  - Set: `FLEET_ROLE=knowledge_sync`
  - Run: `claude -p "hello"`
  - Verify: No status.v5 created, no briefings, no timeline events

- [ ] **Test /knowledge-sync command**
  - Run: `/knowledge-sync` on mimesis project
  - Verify: KB files created in `~/.claude/commander/knowledge/mimesis__607a7a7c/`
  - Verify: aliases.json updated
  - Verify: by-name/mimesis symlink created
  - Verify: kb_sync_state row inserted

- [ ] **Test incremental sync**
  - Make: Small doc change
  - Run: `/knowledge-sync`
  - Verify: Only changed sections updated
  - Verify: changelog.md appended

- [ ] **Test --full flag**
  - Run: `/knowledge-sync --full`
  - Verify: All KB files regenerated completely

- [ ] **Test monorepo support**
  - Create: `.fleet/projects.json` with 2 sub-projects
  - Run: `/knowledge-sync`
  - Verify: Both sub-projects have separate KB directories

- [ ] **Test /kb command**
  - Run: `/kb mimesis`
  - Verify: Summary + activity printed inline
  - Verify: File path pointers correct

- [ ] **Test /improve command**
  - Run: `/improve mimesis`
  - Verify: 5-7 suggestions returned
  - Verify: Evidence cites briefing data
  - Verify: Staleness warning if >7 days

- [ ] **Test alias resolution**
  - Run: `/improve mimesis` (by alias)
  - Run: `/improve mimesis__607a7a7c` (by project_id)
  - Verify: Both work correctly

- [ ] **Test UI KB Panel**
  - Navigate: To Commander UI
  - Verify: KB Panel shows project list
  - Verify: Sync button triggers sync
  - Verify: Status badges correct

#### 5.2 Edge Cases
- [ ] **Test empty KB**
  - Clear: `~/.claude/commander/knowledge/`
  - Run: `/kb mimesis`
  - Verify: Error message about uninitialized KB

- [ ] **Test stale project handling**
  - Manually: Set lastSyncAt to 10 days ago
  - Run: `/improve mimesis`
  - Verify: Warning displayed but proceeds

- [ ] **Test alias conflict**
  - Create: Two projects with same repo_name, different hashes
  - Run: `/knowledge-sync`
  - Verify: Warning logged about conflict
  - Verify: First project wins alias

- [ ] **Test branch mismatch**
  - Checkout: Different branch
  - Run: `/knowledge-sync`
  - Verify: Project skipped with warning

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `~/.claude/commander/knowledge/` | Create | Knowledge base directory |
| `~/.claude/commander/knowledge/aliases.json` | Create | Auto + manual alias mapping |
| `~/.claude/commander/knowledge/by-name/` | Create | Symlinks directory |
| `~/.claude/commands/knowledge-sync.md` | Create | Sync command (manual trigger) |
| `~/.claude/commands/kb.md` | Create | KB viewer command |
| `~/.claude/commands/improve.md` | Create | Improvement suggestions (5-7, reality-heavy) |
| `~/.claude/hooks/commander-knowledge-inject.py` | Create | Thin header SessionStart hook |
| `~/.claude/hooks/*.py` | Modify | Add FLEET_ROLE checks |
| `~/.claude/settings.json` | Modify | Register Commander hooks |
| `packages/daemon/src/fleet-db/schema.ts` | Modify | Add kb_sync_state table |
| `packages/daemon/src/routes/kb.ts` | Create | KB API endpoints |
| `packages/ui/src/components/commander/KBPanel.tsx` | Create | Full KB panel UI |

---

## Success Criteria

1. `/improve mvp` works (alias resolution)
2. Suggestions are reality-heavy (cite briefing evidence primarily)
3. Output is 5-7 suggestions with markdown + evidence format
4. Sync agent doesn't pollute timeline/briefings (FLEET_ROLE works)
5. Monorepo projects sync correctly (.fleet/projects.json)
6. UI shows KB panel with freshness + sync buttons
7. Staleness (>7 days) shows warning but doesn't block
8. Manual `/knowledge-sync --full` works for full re-distill
