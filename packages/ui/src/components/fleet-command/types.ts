/**
 * Types for Fleet Command UI
 */

import type { Session } from "../../types/schema";
import type { StatusCounts, StatusFilter } from "../ops-table/types";

/** Plan step from file status */
export interface PlanStep {
  done: boolean;
  text: string;
}

/** Props for FleetCommand main container */
export interface FleetCommandProps {
  sessions: Session[];
}

/** Props for Roster */
export interface RosterProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Compact mode for focus view (narrower width) */
  compact?: boolean;
  /** Status counts for filter badges (optional, enables integrated filters) */
  statusCounts?: StatusCounts;
  /** Current active filter */
  activeFilter?: StatusFilter;
  /** Filter change handler */
  onFilterChange?: (filter: StatusFilter) => void;
}

/** Props for RosterItem (Mission Card) */
export interface RosterItemProps {
  session: Session;
  isSelected: boolean;
  onSelect: () => void;
  /** Compact mode - only show title line */
  compact?: boolean;
}

/** Props for Viewport */
export interface ViewportProps {
  session: Session | null;
  onSendCommand: (text: string) => void;
}

/** Props for TacticalIntel */
export interface TacticalIntelProps {
  session: Session | null;
  /** Fleet events from gateway */
  fleetEvents?: Array<{
    eventId: number;
    ts: string;
    type: string;
    projectId?: string;
    briefingId?: number;
    data: unknown;
  }>;
  /** Gateway connection status */
  gatewayStatus?: "connecting" | "connected" | "disconnected";
  /** Quick action handler for approve/deny (sends y/n to stdin) */
  onQuickAction?: (action: "approve" | "deny") => void;
  /** Manual reconnect handler */
  onReconnect?: () => void;
}

/** Props for CommandBar */
export interface CommandBarProps {
  sessionCount: number;
  workingCount: number;
  /** Selected session (for display in header) */
  selectedSession: Session | null;
  /** Gateway connection status */
  gatewayStatus?: "connecting" | "connected" | "disconnected";
  /** Toggle Commander tab */
  onToggleCommander?: () => void;
  /** Whether Commander tab is shown */
  showCommander?: boolean;
}
