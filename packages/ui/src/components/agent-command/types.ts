/**
 * Types for Agent Command UI
 */

import type { Session } from "../../types/schema";

/** Props for AgentCommand main container */
export interface AgentCommandProps {
  sessions: Session[];
}

/** Props for ProjectNavigator */
export interface ProjectNavigatorProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

/** Props for ProjectGroup */
export interface ProjectGroupProps {
  projectName: string;
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  defaultExpanded?: boolean;
}

/** Props for AgentItem */
export interface AgentItemProps {
  session: Session;
  isSelected: boolean;
  onSelect: () => void;
}

/** Props for TerminalView */
export interface TerminalViewProps {
  session: Session | null;
}

/** Props for LiveStatePanel */
export interface LiveStatePanelProps {
  session: Session | null;
}

/** Project with its sessions */
export interface ProjectWithSessions {
  projectName: string;
  projectPath: string;
  sessions: Session[];
}
