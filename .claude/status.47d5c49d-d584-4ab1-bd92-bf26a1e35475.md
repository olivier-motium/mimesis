---
status: completed
updated: 2026-01-11T09:52:00+00:00
task: Fix StreamDB recovery and WebSocket terminal connection
---

## Summary
Fixed two critical bugs preventing proper operation:

1. **StreamDB Recovery** - Auto-recovery from corruption now works:
   - Added missing `resume()` call in stream.ts after successful reset
   - Fixed API path mismatch (`/api/v1` → `/api`)
   - Clear cached DB instances before reset
   - Increased wait time from 1s to 2s
   - Made republish failures fatal

2. **WebSocket Terminal Connection** - Fixed error 1006:
   - Added 1-second PTY process stability check in pty-manager.ts
   - Added abort flag pattern in Terminal.tsx for React StrictMode

Both issues verified working via browser testing.
