---
status: completed
updated: 2026-01-09T20:12:00+00:00
task: Fix Mimesis UI session loading issues
---

## Summary
Fixed multiple UI issues related to session loading and display:

1. **Status watcher race condition** - Added pending status queue to handle updates for sessions not yet in cache
2. **StatusWatcher initialization** - Fixed chokidar "ready" event handling and await async file reads
3. **PTY error handling** - Added logging and hint message for "Session not found"
4. **UI retry logic** - Added auto-retry (up to 3 times) when session not found in Viewport
5. **Sidebar repo grouping** - Sessions now grouped by repository with collapsible headers

All 95 daemon tests pass. UI builds successfully.
