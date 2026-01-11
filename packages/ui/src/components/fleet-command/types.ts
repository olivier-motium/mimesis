/**
 * Types for Fleet Command UI
 */

import type { Session } from "../../types/schema";

/** View mode for the Fleet Command layout */
export type ViewMode = "ops" | "focus";

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
}

/** Props for CommandBar */
export interface CommandBarProps {
  sessionCount: number;
  workingCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Selected session in focus mode (null in ops mode) */
  selectedSession: Session | null;
  onBackToOps: () => void;
}
