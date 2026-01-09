/**
 * EventTicker - Bottom bar (Zone D)
 *
 * Shows global event stream for cross-agent awareness
 */

import { Activity } from "lucide-react";
import { formatTickerTime } from "./constants";
import type { EventTickerProps } from "./types";

export function EventTicker({ events }: EventTickerProps) {
  return (
    <footer className="fleet-ticker">
      <span className="fleet-ticker__label">
        <Activity size={10} className="fleet-ticker__label-icon" />
        SYSTEM_LOG:
      </span>

      <div className="fleet-ticker__events">
        {events.length === 0 ? (
          <span style={{ color: "var(--nb-text-muted)" }}>No recent events</span>
        ) : (
          events.map((event) => (
            <span key={event.id} className="fleet-ticker__event">
              <span className="fleet-ticker__event-time">
                [{formatTickerTime(event.timestamp)}]
              </span>
              <span
                className={`fleet-ticker__event-agent fleet-ticker__event-agent--${
                  event.type === "error"
                    ? "error"
                    : event.type === "waiting"
                    ? "waiting"
                    : "working"
                }`}
              >
                {event.sessionName}
              </span>
              <span className="fleet-ticker__event-message">{event.message}</span>
            </span>
          ))
        )}
      </div>
    </footer>
  );
}
