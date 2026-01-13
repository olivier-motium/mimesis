---
status: completed
updated: 2026-01-13T19:15:00Z
task: Added audit button to KBPanel
---

## Summary

Added `/audit` skill integration to the UI:

- Added audit button (Search icon) to each project row in KBPanel.tsx
- Added audit API client functions to kb-api.ts (getProjectAudits, getAuditContent, saveAuditResult)
- Updated footer hint to mention `/audit` command
- All TypeScript builds pass
