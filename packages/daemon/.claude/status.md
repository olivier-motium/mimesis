---
status: completed
updated: 2026-01-12T06:45:00Z
task: Fix deprecated model names and add hot reload
---

## Summary

- Fixed deprecated `claude-3-opus-20240229` model IDs in job-runner.ts
- Now uses model aliases directly: `opus`, `sonnet`, `haiku`
- Added hot reload to daemon serve script (`tsx watch`)
