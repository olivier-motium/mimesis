# Knowledge Base Architecture

The Commander Knowledge Base (KB) is a persistent, distilled repository of project knowledge that enables intelligent improvement suggestions via the `/improve` command.

## Overview

The KB implements a **two-layer model** that weights operational reality (70%) over stated intent (30%):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Knowledge Base Layers                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  REALITY LAYER (70%)                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Source: 14-day briefings, session activity, blockers, doc drift        ││
│  │  Files: activity.md, changelog.md                                        ││
│  │  Purpose: What's ACTUALLY happening in the project                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  INTENT LAYER (30%)                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Source: docs/, CLAUDE.md, MEMORIES.md                                   ││
│  │  Files: summary.md, architecture.md, business-logic.md, known-issues.md ││
│  │  Purpose: What the project IS and WHY decisions were made                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

Location: `~/.claude/commander/knowledge/`

```
knowledge/
├── aliases.json                # Auto-generated + manual alias overrides
├── index.md                    # Fleet-wide overview
├── by-name/                    # Symlinks for shell navigation
│   ├── mvp -> ../mvp__abc123
│   └── mimesis -> ../mimesis__607a7a7c
│
└── <project_id>/               # Per-project knowledge (canonical ID)
    ├── summary.md              # Project purpose, goals, users
    ├── architecture.md         # Tech stack, patterns, integrations
    ├── business-logic.md       # Domain rules, entities, workflows
    ├── known-issues.md         # Tech debt, gotchas, deferred decisions
    ├── activity.md             # 14-day briefing analysis (reality layer)
    └── changelog.md            # Rolling 30-day + monthly rollups
```

## Project Identity

Projects are identified by `<repo_name>__<hash>` format, where the hash is derived from the git remote URL. This ensures uniqueness across orgs with same-named repos.

### Alias Resolution

The `/improve` and `/kb` commands support flexible project resolution:

1. **Exact project_id**: `mvp__abc123`
2. **Alias lookup**: `mvp` → resolved via `aliases.json`
3. **Unique prefix match**: `mim` → `mimesis__607a7a7c` (if unique)

```json
// aliases.json
{
  "mvp": "mvp__abc123",
  "mimesis": "mimesis__607a7a7c",
  "_manual_overrides": {
    "onboarding": "mvp__abc123"  // Custom alias
  }
}
```

## Knowledge Files

### summary.md

Contains YAML frontmatter with provenance tracking:

```yaml
---
schema: knowledge.v1
project_id: mimesis__607a7a7c
updated_at: 2026-01-13T02:01:00Z
sync_type: incremental
source_commits: [def4567, 9912abc]
source_files:
  - docs/index.md
  - CLAUDE.md
---
# Summary

Mimesis is a real-time monitoring dashboard for Claude Code sessions...
```

### activity.md (Reality Layer)

Generated from 14-day briefing window:

```yaml
---
schema: activity.v1
project_id: mimesis__607a7a7c
generated_at: 2026-01-13T02:01:00Z
briefing_window: 14d
briefing_count: 47
---
# Recent Activity Summary (14 days)

## Top Changed Areas
- src/auth/: 12 sessions, 8 major changes
- docs/api.md: flagged for drift 3 times

## Recurring Blockers
- CI flakiness in integration tests (blocked 5 sessions)

## Operational Patterns
- Heavy refactoring week (Jan 8-12)
- doc_drift_high: 2 occurrences
```

## Sync Process

### Manual Trigger

KB sync is triggered manually via `/knowledge-sync`:

```bash
# In Commander chat
/knowledge-sync           # Incremental sync all projects
/knowledge-sync --full    # Full re-distill all projects
/knowledge-sync mvp       # Sync specific project
```

### Sync Algorithm

1. **Discover projects** from Fleet DB
2. **Check for changes** via `git diff <lastCommit>..HEAD`
3. **Read changed docs** from `docs/`, `CLAUDE.md`, `MEMORIES.md`
4. **Query 14-day briefings** from Fleet DB
5. **Distill with Sonnet** into structured knowledge files
6. **Write with provenance** frontmatter
7. **Update sync state** in `kb_sync_state` table

### Automation Role Isolation

The sync agent runs with `FLEET_ROLE=knowledge_sync` to prevent:
- Creating status files
- Generating briefings
- Polluting the timeline
- Triggering normal hooks

Only a summary event (`knowledge_sync_completed`) is emitted.

## Database Schema

### kb_sync_state Table

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
```

## API Endpoints

### GET /api/kb/projects

Returns list of projects with sync state:

```json
[
  {
    "projectId": "mimesis__607a7a7c",
    "name": "mimesis",
    "lastSyncAt": "2026-01-13T02:01:00Z",
    "syncType": "incremental",
    "briefingCount": 47,
    "isStale": false,
    "hasKb": true
  }
]
```

### GET /api/kb/stats

Returns fleet-wide KB statistics:

```json
{
  "initialized": true,
  "totalProjects": 3,
  "totalBriefings": 127,
  "staleProjects": 1
}
```

### POST /api/kb/sync

Triggers KB sync (returns instructions for manual execution):

```json
{
  "message": "Run /knowledge-sync in Commander to sync the knowledge base"
}
```

## UI Integration

### KBPanel Component

Located in Commander's Fleet Intel sidebar:

```
┌─────────────────────────────────────────┐
│ Knowledge Base               [Sync All] │
├─────────────────────────────────────────┤
│ Project  │ Last Sync │ Status │ Actions │
│ mvp      │ 2d ago    │ Fresh  │ [Sync]  │
│ mimesis  │ 8d ago    │ Stale  │ [Sync]  │
│ api-svc  │ Never     │ None   │ [Sync]  │
└─────────────────────────────────────────┘
```

### Status Indicators

| Status | Condition | Badge |
|--------|-----------|-------|
| Fresh | Synced within 7 days | Green check |
| Stale | Synced > 7 days ago | Amber warning |
| None | Never synced | Gray X |

## Commands

### /knowledge-sync

Triggers knowledge base synchronization:

```
/knowledge-sync           # Incremental sync (changed files only)
/knowledge-sync --full    # Full re-distill from scratch
/knowledge-sync <project> # Sync specific project
```

### /kb \<project\>

View knowledge summary for a project:

```
/kb mimesis

# Output:
# mimesis Knowledge Base
# Last synced: 2 days ago | Sync type: incremental | 14-day briefings: 47
#
# ## Summary
# [truncated content from summary.md]
#
# ## Recent Activity (14 days)
# [content from activity.md]
```

### /improve \<project\>

Generate 5-7 improvement suggestions grounded in operational reality:

```
/improve mimesis

# Output:
# Improvement Suggestions for mimesis
# Knowledge freshness: 2 days | Briefing window: 14 days | Sessions: 47
#
# ## Executive Summary
# [Analysis based on 70% reality + 30% intent]
#
# ## High-Leverage Improvements
# 1. [Category] Suggestion Title
#    Impact: High | Effort: Days | Confidence: High
#    Evidence: "Based on 12 sessions touching auth/ last week..."
# ...
```

## Monorepo Support

For repositories with multiple logical projects, add `.fleet/projects.json`:

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

## Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Sync trigger | Manual only | Via `/knowledge-sync` |
| Briefing window | 14 days | For activity layer |
| Staleness threshold | 7 days | Shows warning |
| Reality/Intent weight | 70/30 | For `/improve` |
| Suggestion count | 5-7 | Per `/improve` |
| Distillation model | Sonnet | For knowledge synthesis |

## Security

- KB directory permissions: `chmod 700 ~/.claude/commander/knowledge`
- No doc redaction (trust the docs)
- No per-project access policies

## Related Documentation

- [Commander Architecture](commander.md) - Parent system
- [Fleet DB Schema](fleet-db.md) - Database structure
- [Gateway Protocol](../api/gateway-protocol.md) - Real-time events
