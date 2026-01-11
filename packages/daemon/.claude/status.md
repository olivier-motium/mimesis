---
status: completed
updated: 2026-01-11T20:00:00Z
task: Fix external session display in Timeline
---

## Summary
Fixed the "External session - monitoring status only" message to show useful session info.

### Changes Made
- Enhanced gateway-server.ts to send detailed events for external sessions:
  - Session header with branch info
  - Task from status file or truncated original prompt
  - Summary from status file (if available)
  - Status indicator with emoji
  - Working directory
- Fixed data vs text property mismatch in useSessionEvents.ts (daemon sends `data`, UI expected `text`)
- Fixed duplicate events when switching sessions by clearing events before re-attaching

### Files Modified
**Daemon:**
- `src/gateway/gateway-server.ts` - Enhanced watcher session attach with detailed info events

**UI:**
- `src/hooks/useSessionEvents.ts` - Map `event.data` to `text` for Timeline rendering
- `src/components/fleet-command/FleetCommand.tsx` - Clear session events before attaching

### Result
External sessions now display meaningful information in Timeline instead of generic "monitoring status only" message.
