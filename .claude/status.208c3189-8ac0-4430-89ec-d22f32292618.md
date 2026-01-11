---
status: completed
updated: 2026-01-11T11:58:00+00:00
task: Fix terminal history lost when switching between terminals
---

## Summary
Fixed the "some terminals work, some don't" issue. Root cause: PTY output during the 1-second stability check was not being captured. Added early output buffering to capture data during stability check and include it in the session buffer.

## Changes Made
1. Added `earlyOutputBuffer` to capture PTY output during stability check
2. Buffer is transferred to session's `outputBuffer` after stability check passes
3. This ensures terminal history is preserved even for fast-outputting Claude sessions

## Files Modified
- `packages/daemon/src/pty/pty-manager.ts` - Early output buffering
- `.claude/MEMORIES.md` - Documented output buffering pattern
