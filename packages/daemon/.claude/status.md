---
status: completed
updated: 2026-01-11T11:50:00Z
task: Add PTY output buffer for terminal history preservation
---

## Summary
Implemented circular output buffer in PtyManager to preserve terminal history when switching between terminals:

- Added `outputBuffer: string[]` field to PtySession interface
- Buffer stores last 5000 output chunks from PTY process
- On WebSocket client connect, buffer is replayed to show historical content
- Fixes issue where switching away and back to a terminal showed empty content

## Files Modified
- `src/pty/types.ts` - Added outputBuffer field
- `src/pty/pty-manager.ts` - Buffer initialization, storage, and replay logic
