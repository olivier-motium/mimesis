---
status: completed
updated: 2026-01-09T17:35:00Z
task: Fix duplicate session rows in UI
---

## Summary
Fixed duplicate session rows caused by multiple Claude Code sessions sharing the same `.claude/status.md` file per project. Added deduplication logic in `useSessions.ts` to show only the most recent session per cwd (project directory). This ensures one row per project regardless of how many session files exist.
