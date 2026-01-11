# UI Components

The React UI is built with TanStack Router, shadcn/ui (Radix primitives + Tailwind CSS v4), TanStack Table, and custom Mimesis styling.

## Component Hierarchy (Agent Command)

```
__root.tsx (dark theme wrapper)
└── index.tsx (Agent Command Page)
    └── AgentCommand (3-zone operator console)
        ├── CommandBar (top header)
        ├── ProjectNavigator (left sidebar)
        │   └── ProjectGroup[] (grouped by repo)
        │       └── AgentItem[] (individual agents)
        ├── TerminalView (center terminal)
        │   └── Terminal (xterm.js instance)
        └── LiveStatePanel (right sidebar)
            ├── StatusBadge
            ├── NowSection
            ├── CwdSection
            └── RecentOutput
```

> **Design Philosophy:** Agent-focused, not Git-focused. We monitor agents running in terminals, not diffs or PRs. The sidebar shows projects with active agents as clickable "tabs". Clicking an agent opens its terminal in the center. No tab bar above terminal - the sidebar IS the tab system.

---

## Agent Command Module

**Location:** `packages/ui/src/components/agent-command/`

| File | Purpose |
|------|---------|
| `AgentCommand.tsx` | Main container with 3-zone layout |
| `ProjectNavigator.tsx` | Left sidebar with project tree |
| `ProjectGroup.tsx` | Collapsible project section |
| `AgentItem.tsx` | Individual agent entry (the "tab") |
| `TerminalView.tsx` | Center terminal wrapper |
| `LiveStatePanel.tsx` | Right sidebar with live state |
| `types.ts` | TypeScript interfaces |
| `index.ts` | Barrel exports |

---

## 3-Zone Grid Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ COMMAND BAR: Logo, Online Status, Agent Counts                      │
├───────────────┬────────────────────────────────────┬────────────────┤
│ PROJECT NAV   │ TERMINAL                           │ LIVE STATE     │
│ (280px)       │ (flex: 1)                          │ (320px)        │
│               │                                    │                │
│ ▼ mimesis     │                                    │ STATUS         │
│   ● agent-1   │  > Terminal output here...         │ ● Working      │
│   ○ agent-2   │  > claude working on task...       │                │
│               │  > Let me read the file.           │ NOW            │
│ ▼ conductor   │  >                                 │ Editing api.ts │
│   ● agent-3   │                                    │                │
│   ● agent-4   │                                    │ CWD            │
│               │                                    │ ~/mimesis      │
│ ▼ fleet-api   │                                    │                │
│   ○ agent-5   │                                    │ RECENT OUTPUT  │
│               │                                    │ AI: "Perfect!" │
│               │                                    │ Tool: Edit...  │
│               │                                    │ User: "fix it" │
└───────────────┴────────────────────────────────────┴────────────────┘
```

**Grid Configuration:**
```css
grid-template-areas:
  "header header header"
  "sidebar terminal intel";
grid-template-columns: 280px 1fr 320px;
grid-template-rows: 48px 1fr;
```

---

## Left Sidebar: Project Navigator

Groups sessions by `gitRepoId` (or `cwd` fallback). Each agent is a clickable "tab".

### `ProjectNavigator`

**Props:**
- `sessions: Session[]` - All sessions
- `selectedSessionId: string | null` - Currently selected
- `onSelectSession: (id: string) => void` - Selection callback

**Features:**
- Groups sessions by gitRepoId or cwd
- Renders ProjectGroup for each project

### `ProjectGroup`

**Props:**
- `projectName: string` - Display name
- `sessions: Session[]` - Sessions in this project
- `selectedSessionId: string | null` - Currently selected
- `onSelectSession: (sessionId: string) => void` - Selection callback
- `defaultExpanded?: boolean` - Initial expanded state

**Features:**
- Collapsible with chevron toggle
- Shows working count badge
- Shows total count badge

### `AgentItem`

**Props:**
- `session: Session` - Session data
- `isSelected: boolean` - Selection state
- `onSelect: () => void` - Click handler

**Displays:**
- Status indicator (●/○/!/✖)
- Agent name (branch or session ID)
- Git branch icon

**Status Indicators:**
| Status | Symbol | Class |
|--------|--------|-------|
| working | ● | `--working` |
| waiting | ! | `--waiting` |
| idle | ○ | `--idle` |
| error | ✖ | `--error` |

---

## Center: Terminal View

Shows the terminal for the selected agent.

### `TerminalView`

**Props:**
- `session: Session | null` - Selected session

**Features:**
- Wraps existing Terminal component
- PTY initialization with retry logic
- Empty state when no agent selected
- Auto-retry on "Session not found" errors

**PTY Lifecycle:**
1. Session selected → check for existing PTY
2. Call `ensurePty(sessionId)` to get-or-create
3. Connect Terminal component to WebSocket
4. Handle connection/disconnection states

---

## Right Sidebar: Live State Panel

Shows live state for the selected agent.

### `LiveStatePanel`

**Props:**
- `session: Session | null` - Selected session

**Sections:**
1. **STATUS** - Working/Waiting/Idle/Error badge
2. **NOW** - Current action text
3. **CWD** - Working directory (truncated)
4. **LAST ACTIVITY** - Time since last activity
5. **RECENT OUTPUT** - Last 10 output entries (role + content)

**Status Badge Colors:**
| Status | Color |
|--------|-------|
| working | Green |
| waiting | Yellow |
| idle | Gray |
| error | Red |

---

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate agents |
| `Escape` | Deselect agent |

**Implementation:**
- Global `keydown` listener in `AgentCommand`
- Skipped when focus is in input/textarea
- Cycles through all agents across projects

---

## Legacy: Component Hierarchy (Fleet Command)

```
__root.tsx (dark theme wrapper)
└── index.tsx (Fleet Command Page)
    └── FleetCommand (4-zone operator console)
        ├── CommandBar (top header)
        ├── Roster (Zone A - left sidebar)
        │   └── RosterItem (individual agent)
        ├── Viewport (Zone B - center terminal)
        │   └── Terminal (xterm.js instance)
        ├── TacticalIntel (Zone C - right sidebar)
        │   ├── ExecutionPlan
        │   └── ArtifactsList
        └── EventTicker (Zone D - bottom bar)
```

> **Design Philosophy:** The UI follows a "Fleet Command" pattern inspired by RTS games (StarCraft, Civ). Agents are "units" to be monitored, not "tasks" to be moved. The terminal is always visible, and clicking an agent instantly tunes the viewport to their frequency.

---

## Core Layout

### 4-Zone Grid

The Fleet Command uses a CSS Grid layout with 4 static zones:

```
┌─────────────────────────────────────────────────────────────────────┐
│ COMMAND BAR: [MIMESIS] [ONLINE] [AGENTS: 3/5]                 [v2] │
├──────────────┬─────────────────────────────────────┬────────────────┤
│ ROSTER       │ VIEWPORT                            │ TACTICAL INTEL │
│ (Zone A)     │ (Zone B)                            │ (Zone C)       │
│              │                                     │                │
│ [agent-1] ●  │ ┌─ HUD ─────────────────────────┐  │ EXECUTION PLAN │
│ [agent-2] ○  │ │ Goal: Refactor JWT refresh... │  │ ☑ Analyze flow │
│ [agent-3] ○  │ └───────────────────────────────┘  │ ☐ Update API   │
│              │                                     │                │
│              │ > Terminal output here...           │ ARTIFACTS      │
│              │ > Working on auth module...         │ src/auth.ts    │
│              │                                     │ tests/auth.ts  │
│              │ ┌─ Command Input ──────────────┐   │                │
│              │ │ Send command to agent...     │   │                │
│              │ └──────────────────────────────┘   │                │
├──────────────┴─────────────────────────────────────┴────────────────┤
│ TICKER: [13:14:02] agent-1 started working | [13:14:05] agent-2... │
└─────────────────────────────────────────────────────────────────────┘
```

**Grid Configuration:**
```css
grid-template-areas:
  "header header header"
  "roster viewport intel"
  "ticker ticker ticker";
grid-template-columns: 288px 1fr 320px;
grid-template-rows: 48px 1fr 28px;
```

---

## Fleet Command Module

**Location:** `packages/ui/src/components/fleet-command/`

| File | Purpose |
|------|---------|
| `FleetCommand.tsx` | Main container with 4-zone layout |
| `CommandBar.tsx` | Top header with logo and status |
| `Roster.tsx` | Left sidebar agent list |
| `RosterItem.tsx` | Individual agent row |
| `Viewport.tsx` | Center terminal with HUD |
| `TacticalIntel.tsx` | Right sidebar with plan/artifacts |
| `EventTicker.tsx` | Bottom event stream |
| `types.ts` | TypeScript interfaces |
| `constants.ts` | Utilities and formatters |
| `index.ts` | Barrel exports |

---

## Zone A: The Roster

High-density vertical list of active agents ("Control Group").

### `Roster`

**Props:**
- `sessions: Session[]` - All sessions
- `selectedSessionId: string | null` - Currently selected
- `onSelectSession: (id: string) => void` - Selection callback
- `searchQuery: string` - Filter query
- `onSearchChange: (query: string) => void` - Search callback

**Features:**
- Search/filter input
- Session list with status indicators
- Yellow accent bar on selected item

### `RosterItem`

**Displays:**
- Agent name (branch or session ID)
- Status icon (working/waiting/idle/error)
- Git branch
- Last activity time

**Status Colors:**
| Status | Color |
|--------|-------|
| working | Green (`#10b981`) |
| waiting | Yellow (`#eab308`) |
| idle | Gray (`#3f3f46`) |
| error | Red (`#ef4444`) |

---

## Zone B: The Viewport

Persistent terminal that "tunes" to the selected agent.

### `Viewport`

**Props:**
- `session: Session | null` - Selected session
- `onSendCommand: (text: string) => void` - Command callback

**Components:**
1. **HUD Overlay** - Shows goal and status badge with gradient fade
2. **Terminal** - xterm.js instance connected to PTY
3. **Command Input** - Text input for sending commands

**PTY Lifecycle:**
1. When session changes → check for existing PTY
2. If none exists → create via `createPty(sessionId)`
3. Connect Terminal component to WebSocket
4. Commands sent via `sendText()` API

### Empty State

When no session selected:
```
┌────────────────────────┐
│         📺            │
│   No agent selected   │
│   Click an agent to   │
│       connect         │
└────────────────────────┘
```

---

## Zone C: Tactical Intel

Shows "why" (the plan) and "where" (artifacts) for the selected agent.

### `TacticalIntel`

**Sections:**
1. **Execution Plan** - Step-by-step task list with checkmarks
2. **Modified Artifacts** - List of files being worked on

**Plan Data Sources:**
- `session.fileStatus?.nextSteps` (if available)
- Fallback: synthesize from `session.goal` and `session.summary`

**Artifact Extraction:**
- `session.pendingTool?.target` (current tool target)
- File paths parsed from `session.recentOutput`

---

## Zone D: The Event Ticker

Global event bus for cross-agent awareness.

### `EventTicker`

**Props:**
- `events: AgentEvent[]` - Recent events (max 50)

**Event Types:**
| Type | Color | Example |
|------|-------|---------|
| `started` | Green | "started working" |
| `completed` | Green | "finished task" |
| `waiting` | Yellow | "requires input" |
| `error` | Red | "encountered an error" |

**Format:** `[HH:MM:SS] agent-name message`

**Event Detection:**
- Compare previous session status to current
- Emit events for meaningful state changes
- Skip uninteresting transitions

---

## Command Bar

Top header with branding and status.

### `CommandBar`

**Props:**
- `sessionCount: number` - Total sessions
- `workingCount: number` - Active sessions

**Displays:**
- Logo: "MIMESIS"
- Online indicator (green pulsing dot)
- Agent count: "AGENTS: X/Y Active"
- Version badge

---

## Keyboard Navigation

RTS-style shortcuts for muscle-memory interaction.

**Keybindings:**
| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate Roster |
| `Escape` | Deselect agent |

**Implementation:**
- Global `keydown` listener in `FleetCommand`
- Skipped when focus is in input/textarea

---

## Styling (Mimesis Theme)

Custom CSS variables for the dark operator console aesthetic.

**Location:** `packages/ui/src/index.css` (Fleet Command section)

### Color Palette

```css
:root {
  --nb-black: #09090b;       /* Deep OLED black */
  --nb-black-light: #0c0c0e; /* Elevated surfaces */
  --nb-terminal: #050505;    /* Terminal background */
  --nb-sidebar: #0a0a0c;     /* Sidebar background */
  --nb-yellow: #eab308;      /* Banana yellow accent */
  --nb-green: #10b981;       /* Working status */
  --nb-orange: #f59e0b;      /* Warning */
  --nb-red: #ef4444;         /* Error */
  --nb-border: #27272a;      /* Borders */
  --nb-text: #a1a1aa;        /* Primary text */
  --nb-text-bright: #fafafa; /* Bright text */
  --nb-text-dim: #52525b;    /* Dim text */
  --nb-text-muted: #3f3f46;  /* Muted text */
}
```

### Key CSS Classes

| Class | Purpose |
|-------|---------|
| `.fleet-command` | Main grid container |
| `.fleet-command-bar` | Top header |
| `.fleet-roster` | Left sidebar |
| `.fleet-roster-item` | Agent row |
| `.fleet-roster-item--selected` | Selected state |
| `.fleet-viewport` | Center terminal area |
| `.fleet-viewport__hud` | Gradient HUD overlay |
| `.fleet-intel` | Right sidebar |
| `.fleet-ticker` | Bottom event bar |

---

## Data Layer

Same as before - uses Durable Streams for real-time sync.

### `useSessions` Hook

**Location:** `packages/ui/src/hooks/useSessions.ts`

**Usage:**
```tsx
function FleetCommandPage() {
  const { sessions } = useSessions();
  return <FleetCommand sessions={sessions} />;
}
```

### `usePtyInitialization` Hook

**Location:** `packages/ui/src/hooks/usePtyInitialization.ts`

Manages PTY initialization for a session. Consolidates PTY logic used by TerminalDock and Viewport.

**Signature:**
```tsx
function usePtyInitialization(
  sessionId: string | null,
  options?: { tabId?: string; cols?: number; rows?: number }
): {
  state: PtyState;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}
```

**Returns:**
- `state.ptyInfo` - PTY connection info (ptyId, wsUrl, wsToken)
- `state.isLoading` - Whether PTY is initializing
- `state.error` - Error message if initialization failed
- `state.isConnected` - Whether terminal is connected to WebSocket
- `setConnected` - Update connection status
- `reset` - Reset state for new session

**Features:**
- Get-or-create PTY in single API call
- Optional `tabId` for segment tracking ("kitty effect")
- Prevents duplicate initialization for same session

### `useTabManager` Hook

**Location:** `packages/ui/src/hooks/useTabs.ts`

Manages terminal tabs for session compaction (segment rotation).

**Signature:**
```tsx
function useTabManager(): {
  tabs: Map<string, TerminalTab>;
  tabsByRepo: Map<string, string[]>;
  isLoading: boolean;
  error: string | null;
  createOrGetTab: (repoRoot: string) => Promise<TerminalTab>;
  getTab: (tabId: string) => TerminalTab | undefined;
  deleteTab: (tabId: string) => Promise<void>;
  refresh: () => Promise<void>;
}
```

**Tab Concept:**
- A "tab" is a stable container that survives session compaction
- When a session compacts, the new segment rotates into the same tab
- This enables the "kitty effect" - compaction is invisible to the user
- Each tab is scoped to a repository root

**Usage:**
```tsx
const { createOrGetTab, tabs } = useTabManager();

// Open terminal for a repo
const tab = await createOrGetTab("/path/to/repo");
// Pass tab.tabId to createPty() for segment tracking
```

---

## Component Library

The UI uses shadcn/ui components built on Radix primitives with Tailwind styling:

| Component | Location | Usage |
|-----------|----------|-------|
| Button | `components/ui/button.tsx` | All buttons (actions, navigation) |
| Dialog | `components/ui/dialog.tsx` | SendTextDialog modal |
| DropdownMenu | `components/ui/dropdown-menu.tsx` | SessionActions menu |
| Checkbox | `components/ui/checkbox.tsx` | Form checkboxes |
| Textarea | `components/ui/textarea.tsx` | Text input areas |
| Table | `components/ui/table.tsx` | DataTable base |

### DataTable (TanStack Table)

**Location:** `components/data-table/`

The DataTable replaces the old OpsTable with TanStack Table v8 architecture:

| File | Purpose |
|------|---------|
| `DataTable.tsx` | Main table component with sorting |
| `columns.tsx` | Column definitions |
| `cells/*.tsx` | Individual cell renderers |

---

## Terminal Dock

**Location:** `components/terminal-dock/`

Persistent terminal panel for the Fleet Command center.

### `TerminalDock`

**Props:**
- `session: Session | null` - Selected session
- `onClose: () => void` - Close callback

**Features:**
- Shows terminal for selected session
- Creates PTY on first attach via `ensurePty()`
- Preserves terminal state when switching sessions (CSS show/hide)
- Header with session info and controls (via `SessionHeader`)

**PTY Lifecycle:**
1. Session selected → check `initializedSessionRef`
2. If new session → call `ensurePty(sessionId)`
3. Connect `Terminal` component to WebSocket
4. Terminal persists until dock closes

---

## Dialog Components

**Location:** `components/`

Modal dialogs for user interactions.

### `SendTextDialog`

Modal for sending text to a Claude Code session without full terminal attachment.

**Props:**
- `sessionId: string` - Target session
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Visibility callback

**Features:**
- Text input area
- "Submit" checkbox (appends Enter key)
- Cmd+Enter shortcut to send
- Works with both embedded PTY and kitty terminals

### `RenameWorkChainDialog`

Modal for renaming work chains (session groups).

**Props:**
- `workChainId: string` - Work chain to rename
- `currentName: string` - Current display name
- `open: boolean` - Dialog visibility
- `onOpenChange: (open: boolean) => void` - Visibility callback

**Features:**
- Text input pre-populated with current name
- Empty input clears the name (reverts to default)
- API call to `renameWorkChain()`

---

## Error Handling

### `ErrorBoundary`

**Location:** `components/ErrorBoundary.tsx`

React error boundary to catch and display errors gracefully, preventing app crashes.

**Props:**
- `children: ReactNode` - Components to wrap
- `fallback?: ReactNode` - Optional custom error UI

**Features:**
- Catches JavaScript errors in child component tree
- Logs error details to console
- Shows user-friendly error message
- "Reload" button to recover

**Usage:**
```tsx
<ErrorBoundary>
  <FleetCommand />
</ErrorBoundary>

// With custom fallback
<ErrorBoundary fallback={<CustomErrorPage />}>
  <App />
</ErrorBoundary>
```
