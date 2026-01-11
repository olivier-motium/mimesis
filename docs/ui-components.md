# UI Components

The React UI is built with TanStack Router, shadcn/ui (Radix primitives + Tailwind CSS v4), and custom Mimesis styling. Real-time updates come from the Fleet Gateway via WebSocket.

## Component Hierarchy (Fleet Command v5)

```
__root.tsx (dark theme wrapper)
└── index.tsx (Fleet Command Page)
    └── FleetCommand (3-column Melty-style layout)
        ├── CommandBar (top header)
        ├── StatusStrip (filter bar)
        ├── Roster (left sidebar)
        │   └── RosterItem[] (individual agents)
        ├── Timeline + SessionInput (center viewport)
        │   ├── Timeline (virtualized event stream)
        │   │   ├── TimelineToolStep (tool use cards)
        │   │   ├── TimelineText (text output)
        │   │   ├── TimelineThinking (thinking blocks)
        │   │   ├── TimelineStdout (terminal output)
        │   │   ├── TimelineProgress (progress events)
        │   │   └── TimelineStatusChange (status transitions)
        │   └── SessionInput (command input)
        └── TacticalIntel (right sidebar)
            ├── Fleet Events
            └── Session Details
```

> **Design Philosophy:** The v5 UI uses a Melty-style 3-column layout. The center viewport shows a structured Timeline of session events rather than a raw terminal. This provides better readability and enables virtualized rendering for performance.

---

## Fleet Command Module

**Location:** `packages/ui/src/components/fleet-command/`

| File | Purpose |
|------|---------|
| `FleetCommand.tsx` | Main container with 3-column layout |
| `CommandBar.tsx` | Top header with logo and status |
| `Roster.tsx` | Left sidebar session list |
| `RosterItem.tsx` | Individual session entry |
| `TacticalIntel.tsx` | Right sidebar with fleet events |
| `types.ts` | TypeScript interfaces |
| `constants.ts` | Utilities and formatters |
| `index.ts` | Barrel exports |

---

## 3-Column Grid Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ COMMAND BAR: Logo, Gateway Status, Agent Counts, Commander Toggle   │
├─────────────────────────────────────────────────────────────────────┤
│ STATUS STRIP: [All: 5] [Working: 2] [Waiting: 1] [Idle: 2]         │
├───────────────┬────────────────────────────────────────┬────────────┤
│ ROSTER        │ VIEWPORT                               │ TACTICAL   │
│ (288px)       │ (flex: 1)                              │ (320px)    │
│               │                                        │            │
│ 🔍 Search...  │ ┌─ Timeline ─────────────────────┐    │ FLEET      │
│               │ │                                │    │ EVENTS     │
│ ▼ mimesis     │ │ [Tool] Edit api.ts             │    │            │
│   ● session-1 │ │ 📝 Modified lines 45-67        │    │ briefing   │
│   ○ session-2 │ │                                │    │ skill      │
│               │ │ [Text] Let me fix that...      │    │ updated    │
│ ▼ conductor   │ │                                │    │            │
│   ● session-3 │ │ [Thinking] Analyzing the       │    │ SESSION    │
│               │ │ error pattern...               │    │ DETAILS    │
│               │ └────────────────────────────────┘    │            │
│               │                                        │ Status     │
│               │ ┌─ Session Input ────────────────┐    │ Branch     │
│               │ │ Send command to session...     │    │ CWD        │
│               │ └────────────────────────────────┘    │            │
└───────────────┴────────────────────────────────────────┴────────────┘
```

**Grid Configuration:**
```css
grid-template-areas:
  "header header header"
  "filters filters filters"
  "roster viewport intel";
grid-template-columns: 288px 1fr 320px;
grid-template-rows: 48px 40px 1fr;
```

---

## Timeline Module

**Location:** `packages/ui/src/components/timeline/`

The Timeline replaces the terminal view with structured event rendering using `@tanstack/react-virtual` for performance.

| File | Purpose |
|------|---------|
| `Timeline.tsx` | Main virtualized container |
| `TimelineToolStep.tsx` | Tool use cards (pre/post phases) |
| `TimelineText.tsx` | Text content blocks |
| `TimelineThinking.tsx` | Thinking/reasoning blocks |
| `TimelineStdout.tsx` | Raw terminal output |
| `TimelineProgress.tsx` | Progress indicators |
| `TimelineStatusChange.tsx` | Status transition markers |

### `Timeline`

**Props:**
- `events: TimelineEvent[]` - Session events to render
- `isScrolledAway: boolean` - User has scrolled up
- `onScrolledAwayChange: (away: boolean) => void` - Scroll state callback
- `className?: string` - Additional CSS classes

**Features:**
- Virtualized rendering for large event streams
- Auto-scroll to bottom on new events (when at bottom)
- "Scroll to bottom" button when scrolled away
- Event-specific row heights for accurate virtualization

### Event Types

```typescript
type TimelineEvent =
  | ToolGroupEvent    // Tool use with pre/post phases
  | TextEvent         // Claude text output
  | ThinkingEvent     // Thinking/reasoning block
  | StdoutEvent       // Raw terminal output
  | ProgressEvent     // Progress percentage/message
  | StatusChangeEvent // Status transition (working → idle)
```

### `TimelineToolStep`

Renders tool invocations with expandable details.

**Displays:**
- Tool name with icon
- Phase indicator (pre/post)
- Success/failure status
- Expandable input/output JSON

### `TimelineText`

Renders Claude's text responses.

**Displays:**
- Formatted text content
- Timestamp

### `TimelineThinking`

Renders thinking/reasoning blocks.

**Displays:**
- Collapsible thinking content
- Visual distinction from regular text

---

## Session Input Module

**Location:** `packages/ui/src/components/session-input/`

| File | Purpose |
|------|---------|
| `SessionInput.tsx` | Command input with signal buttons |
| `InputHistory.tsx` | Input history dropdown |

### `SessionInput`

**Props:**
- `sessionId: string | null` - Active session
- `sessionStatus: "working" | "waiting" | "idle"` - Session state
- `onSendStdin: (sessionId: string, data: string) => void` - Input callback
- `onSendSignal: (sessionId: string, signal: string) => void` - Signal callback

**Features:**
- Text input for sending commands
- Submit button (appends Enter)
- SIGINT button (Ctrl+C)
- Disabled when no session selected
- Input history (up arrow)

---

## Commander Module

**Location:** `packages/ui/src/components/commander/`

The Commander provides a chat interface for headless Claude jobs.

| File | Purpose |
|------|---------|
| `CommanderTab.tsx` | Main Commander view |
| `CommanderHistory.tsx` | Conversation history |
| `CommanderInput.tsx` | Message input |
| `CommanderStreamDisplay.tsx` | Streaming response display |

### `CommanderTab`

**Props:**
- `activeJob: JobState | null` - Current running job
- `onCreateJob: (prompt: string) => void` - Create job callback
- `onCancelJob: () => void` - Cancel job callback

**Features:**
- Toggle via Cmd+Tab
- Shows streaming job output
- Job history display

---

## Left Sidebar: Roster

**Location:** `packages/ui/src/components/fleet-command/Roster.tsx`

Session list with search and filtering.

### `Roster`

**Props:**
- `sessions: Session[]` - All sessions
- `selectedSessionId: string | null` - Currently selected
- `onSelectSession: (id: string) => void` - Selection callback
- `searchQuery: string` - Filter query
- `onSearchChange: (query: string) => void` - Search callback
- `compact?: boolean` - Compact display mode

**Features:**
- Search/filter input
- Session list with status indicators
- Yellow accent bar on selected item

### `RosterItem`

**Displays:**
- Session name (branch or session ID)
- Status indicator (working/waiting/idle)
- Git branch
- Last activity time

**Status Colors:**
| Status | Color |
|--------|-------|
| working | Green (`#10b981`) |
| waiting | Yellow (`#eab308`) |
| idle | Gray (`#3f3f46`) |

---

## Right Sidebar: Tactical Intel

**Location:** `packages/ui/src/components/fleet-command/TacticalIntel.tsx`

Shows fleet events and session details.

### `TacticalIntel`

**Props:**
- `session: Session | null` - Selected session
- `fleetEvents: FleetEvent[]` - Fleet event stream
- `gatewayStatus: GatewayStatus` - Connection status

**Sections:**
1. **Fleet Events** - Recent fleet events (briefings, skill updates)
2. **Session Details** - Selected session metadata

---

## Status Strip

**Location:** `packages/ui/src/components/StatusStrip.tsx`

Filter bar showing session counts by status.

### `StatusStrip`

**Props:**
- `counts: { working: number; waiting: number; idle: number; total: number }` - Session counts
- `activeFilter: StatusFilter` - Current filter
- `onFilterChange: (filter: StatusFilter) => void` - Filter callback

**Filters:**
- All (default)
- Working
- Waiting
- Idle

**Keyboard Shortcuts:**
| Key | Filter |
|-----|--------|
| `A` | All |
| `W` | Working |
| `I` | Waiting (Input) |

---

## Data Layer

### `useGateway` Hook

**Location:** `packages/ui/src/hooks/useGateway.ts`

Primary hook for Gateway WebSocket communication.

**Returns:**
```typescript
interface UseGatewayResult {
  // Connection
  status: "connecting" | "connected" | "disconnected";
  lastError: string | null;

  // Fleet events
  fleetEvents: FleetEvent[];
  lastEventId: number;

  // Session tracking (v5.2 unified store)
  trackedSessions: Map<string, TrackedSession>;
  requestSessionList: () => void;

  // Session operations
  sessions: Map<string, SessionState>;
  attachedSession: string | null;
  sessionEvents: Map<string, SequencedSessionEvent[]>;
  attachSession: (sessionId: string, fromSeq?: number) => void;
  detachSession: (sessionId: string) => void;
  createSession: (projectId: string, repoRoot: string) => void;
  sendStdin: (sessionId: string, data: string) => void;
  sendSignal: (sessionId: string, signal: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
  clearSessionEvents: (sessionId: string) => void;

  // Jobs (Commander)
  activeJob: JobState | null;
  createJob: (request: JobCreateRequest) => void;
  cancelJob: () => void;
}
```

**Usage:**
```tsx
function FleetCommandPage() {
  const gateway = useGateway();

  return (
    <FleetCommand
      sessions={Array.from(gateway.trackedSessions.values())}
    />
  );
}
```

**Features:**
- Singleton WebSocket connection (survives HMR)
- Automatic reconnection with backoff
- Fleet event subscription
- Session lifecycle management
- Job management for Commander

### `useSessionEvents` Hook

**Location:** `packages/ui/src/hooks/useSessionEvents.ts`

Processes raw session events into Timeline-ready format.

**Props:**
- `gateway: UseGatewayResult` - Gateway hook result

**Returns:**
```typescript
interface UseSessionEventsResult {
  events: TimelineEvent[];          // Processed events for Timeline
  isScrolledAway: boolean;          // User has scrolled up
  setScrolledAway: (away: boolean) => void;
}
```

**Features:**
- Converts raw events to Timeline format
- Groups tool events (pre + post)
- Maintains scroll state

---

## Component Library

The UI uses shadcn/ui components built on Radix primitives:

| Component | Location | Usage |
|-----------|----------|-------|
| Button | `components/ui/button.tsx` | All buttons |
| Dialog | `components/ui/dialog.tsx` | Modal dialogs |
| DropdownMenu | `components/ui/dropdown-menu.tsx` | Menus |
| Checkbox | `components/ui/checkbox.tsx` | Form checkboxes |
| Textarea | `components/ui/textarea.tsx` | Text inputs |
| Table | `components/ui/table.tsx` | DataTable base |
| Badge | `components/ui/badge.tsx` | Status badges |
| Tooltip | `components/ui/tooltip.tsx` | Hover tooltips |
| ScrollArea | `components/ui/scroll-area.tsx` | Custom scrollbars |

---

## Dialog Components

### `SendTextDialog`

**Location:** `packages/ui/src/components/SendTextDialog.tsx`

Modal for sending text to a session.

**Props:**
- `sessionId: string` - Target session
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Visibility callback

### `RenameWorkChainDialog`

**Location:** `packages/ui/src/components/RenameWorkChainDialog.tsx`

Modal for renaming work chains.

**Props:**
- `workChainId: string` - Work chain to rename
- `currentName: string` - Current name
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Visibility callback

---

## DataTable

**Location:** `packages/ui/src/components/data-table/`

TanStack Table v8 implementation for tabular session views.

| File | Purpose |
|------|---------|
| `DataTable.tsx` | Main table component |
| `columns.tsx` | Column definitions |
| `cells/*.tsx` | Individual cell renderers |

---

## Styling (Mimesis Theme)

**Location:** `packages/ui/src/index.css`

### Color Palette

```css
:root {
  --nb-black: #09090b;       /* Deep OLED black */
  --nb-black-light: #0c0c0e; /* Elevated surfaces */
  --nb-sidebar: #0a0a0c;     /* Sidebar background */
  --nb-yellow: #eab308;      /* Banana yellow accent */
  --nb-green: #10b981;       /* Working status */
  --nb-orange: #f59e0b;      /* Warning */
  --nb-red: #ef4444;         /* Error */
  --nb-border: #27272a;      /* Borders */
  --nb-text: #a1a1aa;        /* Primary text */
  --nb-text-bright: #fafafa; /* Bright text */
  --nb-text-dim: #52525b;    /* Dim text */
}
```

### Key CSS Classes

| Class | Purpose |
|-------|---------|
| `.fleet-command` | Main grid container |
| `.fleet-command-bar` | Top header |
| `.fleet-filters` | Status strip area |
| `.fleet-roster` | Left sidebar |
| `.fleet-roster-item` | Session row |
| `.fleet-roster-item--selected` | Selected state |
| `.fleet-viewport` | Center timeline area |
| `.fleet-intel` | Right sidebar |

---

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate sessions |
| `Escape` | Deselect / close Commander |
| `Cmd+Tab` | Toggle Commander |
| `A` | Filter: All |
| `W` | Filter: Working |
| `I` | Filter: Waiting |

---

## Error Handling

### `ErrorBoundary`

**Location:** `packages/ui/src/components/ErrorBoundary.tsx`

React error boundary for graceful error display.

**Props:**
- `children: ReactNode` - Components to wrap
- `fallback?: ReactNode` - Custom error UI

**Usage:**
```tsx
<ErrorBoundary>
  <FleetCommand />
</ErrorBoundary>
```

---

## Related Documentation

- [Gateway Architecture](architecture/gateway.md) - WebSocket protocol
- [Fleet DB Schema](architecture/fleet-db.md) - Persistence layer
- [Configuration](operations/configuration.md) - Environment variables
