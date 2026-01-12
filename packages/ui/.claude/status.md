---
status: completed
updated: 2026-01-12T09:15:00Z
task: Commander stateful conversation refactor
---

## Summary

Refactored Commander from stateless headless jobs to persistent conversations using Claude Code's `--continue` flag.

### Changes Made
- Added `conversations` table to SQLite schema for tracking conversation state
- Created `ConversationRepo` with CRUD operations and singleton Commander pattern
- Created `FleetPreludeBuilder` for context injection from outbox events
- Updated `JobRunner` to support `--continue`, `--resume`, `--append-system-prompt`
- Added `commander.send` and `commander.reset` protocol messages
- Created `commander-handlers.ts` with gateway integration
- Updated `useGateway` hook with `sendCommanderPrompt()` and `resetCommander()`
- Updated `CommanderTab` with "New Conversation" button and new props
- Updated `commander.md` documentation with new architecture
