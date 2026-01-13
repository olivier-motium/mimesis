---
status: completed
updated: 2026-01-13T10:55:00Z
task: Commander Event Architecture Refactor - broadcast_level filtering and prelude compaction
---

## Summary

Implemented the Commander Event Architecture refactor to cleanly separate the Timeline firehose from Commander milestones with broadcast_level-based filtering.

### Key Changes

1. **Schema**: Added `broadcast_level` column to `outbox_events` (denormalized for fast filtering)

2. **New Event Types**: `session_started`, `session_blocked`, `doc_drift_warning`

3. **SessionStart Hook Pipeline**:
   - Created `session-start-ingest.py` hook
   - Registered in settings.json
   - POSTs to `/fleet/session-start` endpoint
   - Creates silent outbox events for roster awareness

4. **FleetPreludeBuilder Compaction Algorithm**:
   - Alerts: Always included (blocked/failed/errors)
   - Highlights: Max 1 per project (newest wins)
   - Mentions: Capped at 10 (newest first)
   - Silent: Skipped entirely

5. **Database Migration**: Applied `ALTER TABLE` to production fleet.db

### Files Modified
- `packages/daemon/src/fleet-db/schema.ts`
- `packages/daemon/src/config/fleet.ts`
- `packages/daemon/src/fleet-db/outbox-repo.ts`
- `packages/daemon/src/fleet-db/briefing-ingestor.ts`
- `packages/daemon/src/api/routes/fleet.ts`
- `packages/daemon/src/gateway/fleet-prelude-builder.ts`
- `packages/daemon/src/test-utils/fleet-db-helpers.ts`
- `~/.claude/hooks/session-start-ingest.py` (NEW)
- `~/.claude/settings.json`

All 284 tests pass.
