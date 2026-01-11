---
status: completed
updated: 2026-01-11T19:40:00Z
task: Fleet Commander v5.2 - Gateway as sole source of truth for sessions
---

## Summary
Implemented unified session tracking via Gateway WebSocket, removing Durable Streams dependency.

### Changes Made
- Created `session-store.ts` module that merges watcher-detected + PTY sessions
- Added protocol messages: `sessions.list`, `sessions.snapshot`, `session.discovered/updated/removed`
- Wired SessionWatcher and StatusWatcher to GatewayServer
- Gateway broadcasts session events to all connected clients
- Removed @durable-streams/*, @tanstack/db dependencies from UI
- Deleted sessionsDb.ts, updated useSessions.ts to use useGateway

### Files Modified
**Daemon:**
- `src/gateway/session-store.ts` (new)
- `src/gateway/protocol.ts` (new messages)
- `src/gateway/gateway-server.ts` (watcher integration)
- `src/serve.ts` (StatusWatcher startup)

**UI:**
- `src/hooks/useGateway.ts` (TrackedSession, sessions map)
- `src/hooks/useSessions.ts` (rewritten for gateway)
- `src/data/sessionsDb.ts` (deleted)
- `package.json` (removed durable-streams deps)

### Result
203 sessions now visible in UI via Gateway, with live status updates flowing through WebSocket.
