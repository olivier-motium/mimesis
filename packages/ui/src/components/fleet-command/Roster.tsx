/**
 * Roster - Left sidebar showing all agents
 *
 * Zone A of the Fleet Command layout
 */

import { Search } from "lucide-react";
import { RosterItem } from "./RosterItem";
import type { RosterProps } from "./types";

export function Roster({
  sessions,
  selectedSessionId,
  onSelectSession,
  searchQuery,
  onSearchChange,
}: RosterProps) {
  // Filter sessions by search query
  const filteredSessions = sessions.filter((session) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      session.gitBranch?.toLowerCase().includes(query) ||
      session.goal?.toLowerCase().includes(query) ||
      session.originalPrompt?.toLowerCase().includes(query) ||
      session.sessionId.toLowerCase().includes(query)
    );
  });

  return (
    <aside className="fleet-roster">
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

      <div className="fleet-roster__list">
        {filteredSessions.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--nb-text-muted)" }}>
            {searchQuery ? "No matching agents" : "No active agents"}
          </div>
        ) : (
          filteredSessions.map((session) => (
            <RosterItem
              key={session.sessionId}
              session={session}
              isSelected={session.sessionId === selectedSessionId}
              onSelect={() => onSelectSession(session.sessionId)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
