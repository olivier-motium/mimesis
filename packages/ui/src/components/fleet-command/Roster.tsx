/**
 * Roster - Left sidebar showing all agents
 *
 * Zone A of the Fleet Command layout
 * Supports compact mode for focus view
 * Sessions are grouped by status for attention-first organization:
 *   1. Needs Attention (waiting with pending tool)
 *   2. Running (working status)
 *   3. Idle (collapsed by default)
 *
 * Integrates status filter badges when statusCounts prop is provided.
 */

import { useState } from "react";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { RosterItem } from "./RosterItem";
import { StatusStrip } from "../StatusStrip";
import { getEffectiveStatus } from "@/lib/sessionStatus";
import type { RosterProps } from "./types";
import type { Session } from "@/types/schema";

/** Group sessions by status for attention-first display */
function groupSessionsByStatus(sessions: Session[]) {
  const attention: Session[] = [];
  const running: Session[] = [];
  const idle: Session[] = [];

  for (const session of sessions) {
    const { status } = getEffectiveStatus(session);

    if (status === "waiting" && session.hasPendingToolUse) {
      attention.push(session);
    } else if (status === "working") {
      running.push(session);
    } else {
      idle.push(session);
    }
  }

  return { attention, running, idle };
}

export function Roster({
  sessions,
  selectedSessionId,
  onSelectSession,
  searchQuery,
  onSearchChange,
  compact = false,
  statusCounts,
  activeFilter = "all",
  onFilterChange,
}: RosterProps) {
  // Idle section collapsed by default
  const [idleExpanded, setIdleExpanded] = useState(false);

  // Filter sessions by search query and status filter
  const filteredSessions = sessions.filter((session) => {
    // Apply status filter first
    if (activeFilter !== "all") {
      const { status, fileStatusValue } = getEffectiveStatus(session);
      if (activeFilter === "waiting" && !(status === "waiting" && session.hasPendingToolUse)) return false;
      if (activeFilter === "working" && status !== "working") return false;
      if (activeFilter === "idle" && status !== "idle") return false;
      if (activeFilter === "error" && fileStatusValue !== "error") return false;
      if (activeFilter === "stale" && status !== "stale") return false;
    }

    // Then apply search query
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      session.gitBranch?.toLowerCase().includes(query) ||
      session.goal?.toLowerCase().includes(query) ||
      session.originalPrompt?.toLowerCase().includes(query) ||
      session.sessionId.toLowerCase().includes(query) ||
      session.gitRepoId?.toLowerCase().includes(query) ||
      session.workChainName?.toLowerCase().includes(query)
    );
  });

  // Group filtered sessions by status
  const { attention, running, idle } = groupSessionsByStatus(filteredSessions);

  const rosterClass = compact ? "fleet-roster fleet-roster--compact" : "fleet-roster";

  // Helper to render a session item
  const renderSession = (session: Session) => {
    const chainId = session.workChainId ?? session.sessionId;
    return (
      <RosterItem
        key={chainId}
        session={session}
        isSelected={chainId === selectedSessionId}
        onSelect={() => onSelectSession(chainId)}
        compact={compact}
      />
    );
  };

  return (
    <aside className={rosterClass}>
      {/* Status filter badges - integrated at top */}
      {!compact && statusCounts && onFilterChange && (
        <div className="fleet-roster__filters">
          <StatusStrip
            counts={statusCounts}
            activeFilter={activeFilter}
            onFilterChange={onFilterChange}
          />
        </div>
      )}

      {/* Search - below filters */}
      {!compact && (
        <div className="fleet-roster__search">
          <div className="fleet-roster__search-wrapper">
            <Search className="fleet-roster__search-icon" />
            <input
              type="text"
              className="fleet-roster__search-input"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="fleet-roster__list">
        {filteredSessions.length === 0 ? (
          <div className="roster-empty">
            <div className="roster-empty__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h8M12 8v8" />
              </svg>
            </div>
            <div className="roster-empty__text">
              {searchQuery ? "No matching agents" : "No active agents"}
            </div>
            {!searchQuery && (
              <div className="roster-empty__hint">Agents will appear when sessions start</div>
            )}
          </div>
        ) : (
          <>
            {/* Needs Attention Section - Minimal */}
            {attention.length > 0 && (
              <div className="fleet-roster__section fleet-roster__section--attention">
                <div className="fleet-roster__section-header">
                  <span className="fleet-roster__section-name">Attention</span>
                  <span className="fleet-roster__section-count">{attention.length}</span>
                </div>
                <div className="fleet-roster__section-content">
                  {attention.map(renderSession)}
                </div>
              </div>
            )}

            {/* Running Section - Minimal */}
            {running.length > 0 && (
              <div className="fleet-roster__section fleet-roster__section--running">
                <div className="fleet-roster__section-header">
                  <span className="fleet-roster__section-name">Running</span>
                  <span className="fleet-roster__section-count">{running.length}</span>
                </div>
                <div className="fleet-roster__section-content">
                  {running.map(renderSession)}
                </div>
              </div>
            )}

            {/* Idle Section (collapsible) - Minimal */}
            {idle.length > 0 && (
              <div className="fleet-roster__section fleet-roster__section--idle">
                <button
                  className="fleet-roster__section-header fleet-roster__section-header--clickable"
                  onClick={() => setIdleExpanded(!idleExpanded)}
                >
                  {idleExpanded ? (
                    <ChevronDown size={10} className="fleet-roster__section-chevron" />
                  ) : (
                    <ChevronRight size={10} className="fleet-roster__section-chevron" />
                  )}
                  <span className="fleet-roster__section-name">Idle</span>
                  <span className="fleet-roster__section-count">{idle.length}</span>
                </button>
                {idleExpanded && (
                  <div className="fleet-roster__section-content">
                    {idle.map(renderSession)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
