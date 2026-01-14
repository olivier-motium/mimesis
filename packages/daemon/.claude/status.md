---
status: completed
updated: 2026-01-14T10:35:00Z
task: Fix KB sync jobs - SessionStart hook FLEET_ROLE check and timeout increase
---

## Summary

Fixed KB sync jobs that were failing due to SessionStart echo hook not respecting `FLEET_ROLE` environment variable.

### Root Cause

The first SessionStart hook in `~/.claude/settings.json` was a raw `echo` command that outputted "MANDATORY: read these files" regardless of context. This caused KB sync jobs (which run with `FLEET_ROLE=knowledge_sync`) to spend all their turns reading docs instead of executing the actual sync, hitting the `max_turns` limit.

### Changes Made

1. **Created `~/.claude/hooks/read-docs-reminder.py`**
   - Python script that checks `FLEET_ROLE` environment variable
   - Skips output for `knowledge_sync` and `scheduled_job` roles
   - Preserves exact behavior for interactive sessions

2. **Updated `~/.claude/settings.json`**
   - Replaced echo command with Python script call

3. **Increased job timeout** (`packages/daemon/src/config/fleet.ts`)
   - Changed from 5 to 15 minutes (900,000ms)
   - KB sync needs ~9 minutes for full knowledge distillation

### Verification

- Job #25: Successfully synced MVP project (9.5 minutes)
- Job #26: Successfully synced mimesis project
- KB files updated with fresh timestamps in `~/.claude/commander/knowledge/`
- Hook fix confirmed: SessionStart hooks now return empty stdout for automation roles
