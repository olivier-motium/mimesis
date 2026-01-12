---
status: completed
updated: 2026-01-12T14:50:00Z
task: Fix Commander status not transitioning from "Streaming"
---

## Summary

Fixed Commander UI status indicator being stuck on "Streaming..." after Claude finishes. Root cause was session ID mismatch: PTY sessions registered with PTY ID but status files named with Claude session ID.

**Solution**: Commander now subscribes directly to StatusWatcher for its Claude session ID, bypassing SessionStore lookup mismatch.

## Changes
- `commander-session.ts`: Added direct StatusWatcher subscription for Commander's Claude session ID
  - Added `handleStatusFileUpdate()` method that filters by Claude session ID
  - Subscribe to StatusWatcher after session ID capture
  - Cleanup subscription in reset() and shutdown()
