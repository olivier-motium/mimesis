# UI Components

The React UI is built with TanStack Router and Radix UI Themes.

## Component Hierarchy (Command Center)

```
__root.tsx (Radix Theme provider)
└── index.tsx (Command Center)
    ├── StatusStrip (filter badges by status)
    ├── OpsTable (dense session list)
    │   └── OpsTableRow (individual session)
    └── TerminalDock (persistent terminal panel)
        ├── SessionHeader (session info bar)
        └── Terminal (xterm.js instance)
```

> **Design Philosophy:** The UI follows a "Mission Control" pattern inspired by RTS games - the terminal is the primary instrument, always visible, with a dense ops table for quick session switching via click or keyboard.

---

## Core Components

### `__root.tsx`

Root layout that wraps the app in Radix UI Theme provider.

**Location:** `packages/ui/src/routes/__root.tsx`

**Responsibilities:**
- Radix Theme configuration
- Global styles
- Router outlet

### `index.tsx` (Command Center)

Main dashboard view that displays all sessions with persistent terminal.

**Location:** `packages/ui/src/routes/index.tsx`

**Responsibilities:**
- Fetches sessions via `useSessions()` hook
- Manages selected session state
- Manages status filter state
- Integrates keyboard navigation
- Renders StatusStrip, OpsTable, and TerminalDock

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ StatusStrip: [All: N] [Working: N] [Needs Input: N] ...     │
├─────────────────────────────────────────────────────────────┤
│ OpsTable (scrollable)                                       │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Status │ Goal │ Branch │ Tool │ Activity │ Repo │ ⋮     ││
│ ├─────────────────────────────────────────────────────────┤│
│ │ ● work │ Fix auth bug │ feat-1 │ Edit │ 2m ago │ app │  ││
│ │ ○ wait │ Add tests... │ main   │ Bash │ 5m ago │ lib │  ││
│ └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│ TerminalDock (persistent)                                   │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ [Session: Fix auth bug] [feat-1] [● Working] [×]        ││
│ ├─────────────────────────────────────────────────────────┤│
│ │ > claude --resume abc123                                ││
│ │ Working on authentication module...                     ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Ops Table Module

Dense, scannable session list replacing the previous Kanban cards.

**Location:** `packages/ui/src/components/ops-table/`

| File | Purpose |
|------|---------|
| `OpsTable.tsx` | Main table component with header and body |
| `OpsTableRow.tsx` | Individual row with all session columns |
| `types.ts` | TypeScript interfaces |
| `utils.ts` | Filtering, sorting, counting utilities |
| `constants.ts` | Tool icons and visual constants |
| `index.ts` | Barrel exports |

### `OpsTable`

**Props:**
- `sessions: Session[]` - All sessions
- `selectedSessionId: string | null` - Currently selected session
- `onSelectSession: (sessionId: string | null) => void` - Selection callback
- `filter: StatusFilter` - Current filter
- `onFilterChange: (filter: StatusFilter) => void` - Filter callback

**Features:**
- Fixed header with sortable column labels
- Scrollable body
- Applies filtering and sorting before display
- Highlights selected row

### `OpsTableRow`

**Columns:**
| Column | Source | Width |
|--------|--------|-------|
| Status | `getEffectiveStatus(session).status` | 40px icon |
| Goal | `session.goal \|\| session.originalPrompt` | flex |
| Branch | `session.gitBranch` + PR badge | 120px |
| Tool | `session.pendingTool?.tool` | 60px icon |
| Activity | `formatTimeAgo(session.lastActivityAt)` | 80px |
| Repo | `session.gitRepoId` | 100px |
| Actions | dropdown menu | 40px |

**Status Icons:**
| Status | Icon | Color |
|--------|------|-------|
| working | ● (filled) | Green |
| waiting | ○ (hollow) | Orange |
| idle | ◐ (half) | Gray |

**Tool Icons:**
| Tool | Icon |
|------|------|
| Edit | Pencil |
| Write | Document |
| Read | Book |
| Bash | Terminal |
| Grep | Magnifying glass |
| Glob | Folder |
| Task | Robot |

### Utility Functions

**`filterSessions(sessions, filter)`** - Filters by status or special categories (stale, error)

**`sortSessions(sessions)`** - Sorts by:
1. Attention priority (errors → waiting → working → idle)
2. Last activity time (most recent first)

**`countSessionsByStatus(sessions)`** - Returns counts for StatusStrip badges

**`isSessionStale(session)`** - True if working but no activity for >10 minutes

**`formatTimeAgo(timestamp)`** - Human-readable relative time (e.g., "2m ago")

---

## Status Strip

Clickable filter badges showing session counts by status.

**Location:** `packages/ui/src/components/StatusStrip.tsx`

**Props:**
- `counts: StatusCounts` - Session counts per status
- `activeFilter: StatusFilter` - Currently active filter
- `onFilterChange: (filter: StatusFilter) => void` - Filter callback

**Badge Types:**
| Badge | Filter | Color |
|-------|--------|-------|
| All | `"all"` | Gray |
| Working | `"working"` | Green |
| Needs Input | `"waiting"` | Orange |
| Idle | `"idle"` | Gray |
| Errors | `"error"` | Red |
| Stale | `"stale"` | Amber |

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `A` | Filter: all |
| `W` | Filter: working |
| `I` | Filter: needs input (waiting) |
| `E` | Filter: errors |
| `S` | Filter: stale |

---

## Terminal Dock Module

Persistent terminal panel that stays mounted while sessions switch.

**Location:** `packages/ui/src/components/terminal-dock/`

| File | Purpose |
|------|---------|
| `TerminalDock.tsx` | Main dock component managing PTY lifecycle |
| `SessionHeader.tsx` | Session info bar with close button |
| `index.ts` | Barrel exports |

### `TerminalDock`

**Props:**
- `session: Session` - Currently selected session
- `onClose: () => void` - Close dock callback

**Behavior:**
1. Initializes PTY connection via `usePtySession()` hook
2. Passes PTY config to Terminal component
3. Shows loading state while PTY initializes
4. Displays error state if PTY fails

### `SessionHeader`

**Props:**
- `session: Session` - Session to display
- `isConnected: boolean` - WebSocket connection state
- `onClose: () => void` - Close button callback

**Displays:**
- Session goal (truncated)
- Git branch badge
- Status badge with color
- Connection indicator (green dot)
- Close button (×)

---

## Keyboard Navigation

RTS-style keyboard shortcuts for muscle-memory interaction.

**Location:** `packages/ui/src/hooks/useKeyboardNavigation.ts`

**Keybindings:**
| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection in Ops Table |
| `Enter` | Select first session if none selected |
| `Escape` | Deselect / close terminal dock |
| `A` | Filter: all |
| `W` | Filter: working |
| `I` | Filter: needs input |
| `E` | Filter: errors |
| `S` | Filter: stale |

**Implementation:**
- Global `keydown` listener via `useEffect`
- Skipped when focus is in input/textarea
- Operates on filtered/sorted session list

---

## Session Actions

Dropdown menu for terminal control operations.

**Location:** `packages/ui/src/components/session-card/SessionActions.tsx`

> **Note:** This component is reused from the old card system; location may move to `ops-table/` in future cleanup.

**Options:**
| State | Options |
|-------|---------|
| No terminal linked | "Open in kitty", "Link existing terminal..." |
| Terminal linked | "Focus terminal", "Send message...", "Unlink terminal" |

---

## SendTextDialog

Modal dialog for sending text to a linked terminal.

**Location:** `packages/ui/src/components/SendTextDialog.tsx`

**Props:**
- `sessionId: string` - Session to send text to
- `open: boolean` - Dialog visibility state
- `onOpenChange: (open: boolean) => void` - Visibility callback

**Features:**
- Text area for input
- "Press Enter after sending" checkbox (submit mode)
- Calls `api.sendText()` to send to linked kitty terminal

---

## API Client

The UI includes an API client for terminal control operations.

**Location:** `packages/ui/src/lib/api.ts`

**Functions:**
| Function | Purpose |
|----------|---------|
| `getKittyHealth()` | Check if kitty terminal is available |
| `focusSession(sessionId)` | Focus linked terminal window |
| `openSession(sessionId)` | Open/create terminal for session |
| `linkTerminal(sessionId)` | Link existing terminal via picker |
| `unlinkTerminal(sessionId)` | Remove terminal association |
| `sendText(sessionId, text, submit)` | Send text to linked terminal |

**Configuration:**
- `VITE_API_URL` - Override the API endpoint (default: `http://127.0.0.1:4451/api`)

---

## Data Layer

The UI uses **Durable Streams** (`@durable-streams/state`) for real-time session synchronization:

- `createStreamDB()` creates the reactive state container
- Subscribes to SSE endpoint at `VITE_STREAM_URL` (default: `http://127.0.0.1:4450/sessions`)
- Provides `useSessions()` hook for React components

### `useSessions` Hook

React hook for subscribing to session updates.

**Location:** `packages/ui/src/hooks/useSessions.ts`

**Usage:**
```tsx
import { useSessions } from '../hooks/useSessions';

function MyComponent() {
  const { sessions, isLoading } = useSessions();
  // sessions: Session[]

  return (
    <OpsTable
      sessions={sessions}
      selectedSessionId={selectedId}
      onSelectSession={setSelectedId}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
}
```

**Behavior:**
- Connects to Durable Streams via SSE
- Automatically reconnects on disconnect
- Updates trigger re-renders via React's reactive state

### `sessionsDb`

Singleton StreamDB connection.

**Location:** `packages/ui/src/data/sessionsDb.ts`

**Functions:**
- `getSessionsDb()` - Async getter, initializes connection
- `getSessionsDbSync()` - Sync getter (throws if not initialized)
- `closeSessionsDb()` - Closes connection

**Configuration:**
- `VITE_STREAM_URL` - Override the daemon endpoint (default: `http://127.0.0.1:4450/sessions`)

---

## Session Status Utilities

The UI includes utilities for determining effective session status from file-based or XState-derived sources.

**Location:** `packages/ui/src/lib/sessionStatus.ts`

### `getEffectiveStatus(session)`

Returns the effective status for display and filtering.

**Returns:**
```typescript
interface EffectiveStatus {
  status: "working" | "waiting" | "idle";  // For display
  fileStatusValue: FileStatusValue | null;  // Original 7-value status if fresh
  isFileStatusFresh: boolean;               // Whether file status is being used
}
```

**Status Mapping (7 file statuses → 3 UI statuses):**
| File Status | UI Status |
|-------------|-----------|
| `working` | Working |
| `waiting_for_approval` | Waiting (with pending tool) |
| `waiting_for_input` | Waiting |
| `completed`, `error`, `blocked`, `idle` | Idle |

### `isFileStatusStale(updated, ttlMs)`

Checks if file status timestamp is older than TTL (default: 5 minutes).

### `getStatusBadgeType(session)`

Returns badge type for completed/error/blocked states, or null.

---

## Styling Guidelines

From `packages/ui/CLAUDE.md`:

1. **Always use Radix UI components** - Never use plain HTML elements with custom styles
2. **Let Radix handle typography** - Don't set `fontSize` or `lineHeight` manually
3. **Use Radix style props** - `size`, `color`, `variant` instead of inline styles
4. **Code content** - Use the `Code` component for monospace text

### Custom CSS Classes

The Command Center uses custom CSS classes in `index.css`:

| Class | Purpose |
|-------|---------|
| `.ops-table-row` | Base row styling with hover effects |
| `.ops-table-row.selected` | Selected row highlight |
| `.status-working` | Green status indicator |
| `.status-waiting` | Orange status indicator |
| `.status-idle` | Gray status indicator |
