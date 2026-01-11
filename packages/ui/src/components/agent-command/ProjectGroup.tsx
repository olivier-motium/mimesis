/**
 * ProjectGroup - Collapsible project section in sidebar
 *
 * Shows project name with collapse toggle, and agent entries underneath.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { AgentItem } from "./AgentItem";
import type { ProjectGroupProps } from "./types";

export function ProjectGroup({
  projectName,
  sessions,
  selectedSessionId,
  onSelectSession,
  defaultExpanded = true,
}: ProjectGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Count working agents in this project
  const workingCount = sessions.filter((s) => s.status === "working").length;

  return (
    <div className="project-group">
      {/* Project header */}
      <button
        className="project-group__header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="project-group__toggle">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <Folder size={14} className="project-group__icon" />
        <span className="project-group__name">{projectName}</span>
        {workingCount > 0 && (
          <span className="project-group__badge project-group__badge--working">
            {workingCount}
          </span>
        )}
        <span className="project-group__count">{sessions.length}</span>
      </button>

      {/* Agent list */}
      {isExpanded && (
        <div className="project-group__agents">
          {sessions.map((session) => {
            const chainId = session.workChainId ?? session.sessionId;
            return (
              <AgentItem
                key={session.sessionId}
                session={session}
                isSelected={chainId === selectedSessionId}
                onSelect={() => onSelectSession(chainId)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
