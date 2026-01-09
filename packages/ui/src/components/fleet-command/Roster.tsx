/**
 * Roster - Left sidebar showing all agents
 *
 * Zone A of the Fleet Command layout
 * Supports compact mode for focus view
 * Sessions are grouped by repository for better organization
 */

import { useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import { RosterItem } from "./RosterItem";
import { groupSessionsByRepo } from "../../lib/sessionScoring";
import type { RosterProps } from "./types";

export function Roster({
  sessions,
  selectedSessionId,
  onSelectSession,
  searchQuery,
  onSearchChange,
  compact = false,
}: RosterProps) {
  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        session.gitBranch?.toLowerCase().includes(query) ||
        session.goal?.toLowerCase().includes(query) ||
        session.originalPrompt?.toLowerCase().includes(query) ||
        session.sessionId.toLowerCase().includes(query) ||
        session.gitRepoId?.toLowerCase().includes(query)
      );
    });
  }, [sessions, searchQuery]);

  // Group filtered sessions by repo
  const groupedSessions = useMemo(
    () => groupSessionsByRepo(filteredSessions),
    [filteredSessions]
  );

  const rosterClass = compact ? "fleet-roster fleet-roster--compact" : "fleet-roster";

  return (
    <aside className={rosterClass}>
      {/* Hide search in compact mode */}
      {!compact && (
        <div className="fleet-roster__search">
          <div className="fleet-roster__search-wrapper">
            <Search className="fleet-roster__search-icon" />
            <input
              type="text"
              className="fleet-roster__search-input"
              placeholder="Filter Units..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="fleet-roster__list">
        {filteredSessions.length === 0 ? (
          <div style={{ padding: compact ? 12 : 24, textAlign: "center", color: "var(--nb-text-muted)" }}>
            {searchQuery ? "No matching agents" : "No active agents"}
          </div>
        ) : (
          groupedSessions.map((group) => (
            <div key={group.repoId} className="fleet-roster__group">
              {/* Repo header - show repo name from gitRepoId (owner/repo format) */}
              <div className="fleet-roster__group-header">
                <ChevronDown size={12} className="fleet-roster__group-chevron" />
                <span className="fleet-roster__group-name">
                  {group.repoId === "Other" ? "Other" : group.repoId.split("/").pop() || group.repoId}
                </span>
                <span className="fleet-roster__group-count">{group.sessions.length}</span>
              </div>
              {/* Sessions in this repo - use workChainId as key for React stability across compaction */}
              {group.sessions.map((session) => {
                const chainId = session.workChainId ?? session.sessionId;
                return (
                  <RosterItem
                    key={chainId}
                    session={session}
                    isSelected={chainId === selectedSessionId}
                    onSelect={() => onSelectSession(chainId)}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
