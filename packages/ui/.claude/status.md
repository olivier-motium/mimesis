---
status: completed
updated: 2026-01-13T13:10:00Z
task: Commander UI layout improvements - logical structure
---

## Summary

Improved Commander layout focusing on logical information structure and surfacing:

### Issues Fixed

| # | Issue | Component | Fix |
|---|-------|-----------|-----|
| 1 | TacticalIntel showed irrelevant session data when Commander active | TacticalIntel.tsx | Context-aware: shows Fleet Intel (agent counts, Commander status) when Commander is active |
| 2 | Cluttered Commander header with competing indicators | CommanderTab.tsx | Simplified header, moved status info to TacticalIntel |
| 3 | Nested "Commander Output" container added visual noise | CommanderTab.tsx | Removed nested header, clean content flow |

### Files Modified

- `packages/ui/src/components/fleet-command/types.ts` - Added `showCommander`, `commanderState`, `sessions` props to TacticalIntelProps
- `packages/ui/src/components/fleet-command/TacticalIntel.tsx` - Fleet Intel view when Commander active
- `packages/ui/src/components/fleet-command/FleetCommand.tsx` - Wired new props to TacticalIntel
- `packages/ui/src/components/commander/CommanderTab.tsx` - Simplified header, removed nested container, cleaner states

### Layout Change

Before: TacticalIntel showed last selected session details regardless of Commander view
After: TacticalIntel shows Fleet Intel (agents, working, attention, Commander status) when Commander is active

### Verification

- TypeScript: PASS (pnpm tsc --noEmit)
