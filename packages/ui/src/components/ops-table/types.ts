/**
 * Type definitions for OpsTable components
 */

import type { Session, SessionStatus } from "../../types/schema";

export interface OpsTableProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}

export interface OpsTableRowProps {
  session: Session;
  isSelected: boolean;
  onSelect: () => void;
}

export type StatusFilter = "all" | SessionStatus | "stale" | "error" | "blocked";

export interface StatusCounts {
  all: number;
  working: number;
  waiting: number;
  idle: number;
  stale: number;
  error: number;
}
