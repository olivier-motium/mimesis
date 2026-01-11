---
status: completed
updated: 2026-01-11T11:45:00Z
task: Fix terminal WebSocket reconnection latency
---

## Summary
Fixed terminal latency issues in Agent Command UI:

1. **Memoized callbacks** - Added `useCallback` for `handleConnect`, `handleDisconnect`, `handleError` to prevent WebSocket reconnection spam during StreamDB updates

2. **Race condition fix** - Added staleness checks in `initializePty` after async `ensurePty` call to properly handle fast terminal switching

## Root Cause
- Unmemoized inline callbacks created new function objects on every render
- Terminal's useEffect depends on callbacks → new refs triggered WebSocket close/reopen
- Race condition when switching terminals: stale async results overwrote current state

## Files Modified
- `src/components/agent-command/TerminalView.tsx`
