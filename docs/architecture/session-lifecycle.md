# Session Lifecycle

How sessions are tracked, compacted, and superseded in Mimesis.

## Overview

Mimesis tracks two types of sessions:

| Source | Origin | Lifecycle |
|--------|--------|-----------|
| **Watcher** | External Claude Code sessions in `~/.claude/projects/` | Discovered via file watcher |
| **PTY** | Sessions created via Mimesis UI | Managed PTY with full I/O control |

Both types are unified in the SessionStore and displayed in the Roster.

---

## Session States

```
                    ┌─────────────────┐
                    │      idle       │
                    └────────┬────────┘
                             │ USER_PROMPT
                             ▼
┌─────────────────┐  TOOL_RESULT  ┌─────────────────┐
│ waiting_for_    │◄──────────────│     working     │
│   approval      │               └────────┬────────┘
└────────┬────────┘                        │
         │                    TURN_END / STALE_TIMEOUT
         │                                 │
         └────────────────────────────────▶│
                  IDLE_TIMEOUT     ┌─────────────────┐
                                   │ waiting_for_    │
                                   │     input       │
                                   └─────────────────┘
```

### State Transitions

| From | To | Trigger |
|------|----|---------|
| `idle` | `working` | User prompt received |
| `working` | `waiting_for_approval` | Tool use pending > 5s |
| `working` | `waiting_for_input` | Turn ends or stale > 60s |
| `waiting_for_approval` | `working` | Tool result received |
| `waiting_for_input` | `working` | User prompt received |
| Any | `idle` | No activity > 10 minutes |

### Timeouts

| Constant | Value | Effect |
|----------|-------|--------|
| `APPROVAL_TIMEOUT_MS` | 5 seconds | Detect pending tool approval |
| `STALE_TIMEOUT_MS` | 60 seconds | Fallback for stale working state |
| `IDLE_TIMEOUT_MS` | 10 minutes | Mark session as idle |

---

## Compaction and Segment Chains

When Claude Code compacts a session (via `/compact` or auto-compact at ~95% context), it creates a NEW session file. The old session is superseded.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Segment** | A single Claude Code session file (`.jsonl`) |
| **Segment Chain** | Sequence of sessions connected by compaction |
| **Work Chain ID** | UUID that persists across compaction |
| **Supersession** | When a session is replaced by a compacted successor |

### Compaction Flow

```
SessionStart hook (compact matcher) fires
            ↓
Hook writes marker: .claude/compacted.<newSessionId>.marker
            ↓
CompactionWatcher detects marker file
            ↓
Daemon finds predecessor (same terminal context)
            ↓
Predecessor marked superseded, workChainId inherited
            ↓
UI automatically switches to successor
```

### Marker File Format

```json
{
  "newSessionId": "abc123def456",
  "cwd": "/path/to/project",
  "compactedAt": "2026-01-11T18:00:00.000Z"
}
```

---

## Work Chain Matching

When a compaction occurs, the daemon must identify which session was superseded.

### Matching Strategy

1. **With terminal context (kittyWindowId)**
   - Only consider sessions in the SAME terminal
   - Most reliable for multi-tab workflows

2. **Without terminal context**
   - Use most recently active session in same `cwd`
   - Heuristic fallback for embedded Mimesis terminals

### Why Work Chains Matter

Multiple terminal tabs can work on the same repo independently. Each tab is a separate work chain. Compaction should only supersede the direct predecessor, not all sessions in the same directory.

```
Tab 1: session-a → session-b (compacted) → session-c
Tab 2: session-x → session-y (compacted) → session-z

Compacting session-b does NOT affect Tab 2's sessions.
```

---

## Session Schema

```typescript
interface TrackedSession {
  sessionId: string;
  projectId?: string;
  repoRoot?: string;
  status: "working" | "waiting" | "idle";
  hasPendingToolUse: boolean;
  pendingTool?: { tool: string; target: string };
  goal?: string;
  summary?: string;
  branch?: string;
  lastActivityAt: string;
  createdAt?: string;

  // Supersession fields
  superseded?: boolean;
  supersededBy?: string;
  supersededAt?: string;

  // Work chain fields
  workChainId?: string;
  workChainName?: string;
  compactionCount?: number;

  // Source tracking
  source: "watcher" | "pty";
}
```

---

## File-Based Status

Sessions can receive status updates from `.claude/status.<sessionId>.md` files written by Claude Code hooks.

### Status File Format

```yaml
---
status: working
updated: 2026-01-11T18:00:00Z
task: Implementing feature X
---

## Summary
Working on the authentication module.
```

### Status Values

| Status | Meaning |
|--------|---------|
| `working` | Actively processing |
| `waiting_for_approval` | Tool use pending |
| `waiting_for_input` | Waiting for user |
| `completed` | Task finished |
| `error` | Error occurred |
| `blocked` | Blocked on dependency |
| `idle` | No activity |

### Staleness

Status files are valid for 5 minutes (`STATUS_FILE_TTL_MS`). After that, status falls back to XState machine derivation.

---

## Session Store Events

The SessionStore emits events for UI updates:

| Event | Payload | Trigger |
|-------|---------|---------|
| `discovered` | `TrackedSession` | New session detected |
| `updated` | `sessionId`, `updates` | Session state changed |
| `removed` | `sessionId` | Session deleted |

---

## UI Behavior

### Automatic Switching

When a session is superseded while selected in the UI:

1. UI detects `superseded: true` update
2. Finds successor via `supersededBy` field
3. Automatically switches selection to successor
4. Timeline continues seamlessly

### Filtering

Superseded sessions are filtered from the Roster by default. Only the latest session in each work chain is shown.

---

## Related Documentation

- [Gateway Protocol](../api/gateway-protocol.md) - Session messages
- [Configuration Reference](configuration-reference.md) - Timeout values
- [Fleet DB Schema](fleet-db.md) - Session persistence
