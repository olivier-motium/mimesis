---
status: completed
updated: 2026-01-11T18:45:00Z
task: Restructured E2E tests into modular files
---

## Summary
Broke up the massive 1437-line test file into smaller, focused modules per user request:

**Fleet-db tests (~100-190 lines each):**
- `status-v5-parser.test.ts` - YAML frontmatter parsing (8 tests)
- `project-repo.test.ts` - Project repository operations (8 tests)
- `briefing-repo.test.ts` - Briefing repository operations (8 tests)
- `outbox-repo.test.ts` - Outbox event queue operations (8 tests)
- `job-repo.test.ts` - Job queue operations (8 tests)

**Gateway tests (~130-170 lines each):**
- `ring-buffer.test.ts` - Event buffer with eviction (13 tests)
- `event-merger.test.ts` - PTY/hook event merging (11 tests)

All 184 tests pass across 15 test files.
