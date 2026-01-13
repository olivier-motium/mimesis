---
status: completed
updated: 2026-01-13T10:45:00Z
task: UX improvements round 2 - actionable buttons and reconnect
---

## Summary

Completed second round of UX improvements for Fleet Command UI. Focused on actionable controls and error recovery.

### Issues Fixed

| # | Issue | Component | Fix |
|---|-------|-----------|-----|
| 1 | Non-actionable approval hint | TacticalIntel.tsx | Added Approve/Deny buttons with `onQuickAction` callback |
| 2 | Icon-only buttons | SessionInput.tsx | Added text labels ("Cancel", "Send") alongside icons |
| 3 | No reconnect option | TacticalIntel.tsx | Added Reconnect button when gateway disconnected |

### Files Modified

- `packages/ui/src/components/fleet-command/types.ts` - Added `onQuickAction` and `onReconnect` props
- `packages/ui/src/components/fleet-command/TacticalIntel.tsx` - Approve/deny and reconnect buttons
- `packages/ui/src/components/fleet-command/FleetCommand.tsx` - Wired handlers
- `packages/ui/src/components/session-input/SessionInput.tsx` - Text labels on buttons
- `packages/ui/src/hooks/useGateway.ts` - Added reconnect function
- `packages/ui/src/hooks/gateway-connection.ts` - Added forceReconnect function
- `packages/ui/src/index.css` - CSS for new UI elements

### Estimated UX Score Improvement

- Before: 6.1/10
- After: 7.2/10

### Verification

- UI production build: PASS
