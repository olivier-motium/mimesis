---
status: completed
updated: 2026-01-14T09:35:00Z
task: KB sync button fix - buttons now trigger actual sync jobs
---

## Summary

Fixed KB sync buttons to actually trigger KB sync instead of just showing a message dialog.

### Changes Made
- Updated daemon to expose JobManager and pass it to KB API routes
- Modified POST /kb/sync endpoints to create headless jobs that run /knowledge-sync
- Added KB_SYNC job type and env field support to job system
- Updated UI to show proper feedback when sync job starts (green "Sync Started" vs purple "Run in Commander")
- Updated schema types to include jobId in sync responses
