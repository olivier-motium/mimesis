---
status: completed
updated: 2026-01-09T18:45:00Z
task: Fix terminal gray screen rendering and remove footer
---

## Summary
Fixed two UI issues:

1. **Terminal Gray Screen**: Fixed rendering issue where terminal stayed gray until window resize. Root cause was RAF firing before flex layout was calculated. Solution: moved initial fit() to ResizeObserver effect.

2. **Footer Removed**: Completely removed EventTicker footer component per user request. Cleaned up CSS grid layouts, types, constants, and exports.

Files modified: Terminal.tsx, FleetCommand.tsx, types.ts, constants.ts, index.ts, index.css
Files deleted: EventTicker.tsx
