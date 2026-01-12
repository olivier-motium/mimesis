/**
 * Outbox Tailer - Polls outbox table and pushes fleet events to clients.
 *
 * Implements cursor-based polling of the outbox_events table and
 * broadcasts events to all subscribed WebSocket clients.
 */

import { OutboxRepo } from "../fleet-db/outbox-repo.js";
import type { OutboxEvent as DbOutboxEvent } from "../fleet-db/schema.js";
import { OUTBOX_POLL_INTERVAL_MS } from "../config/index.js";
import type { FleetEventMessage, FleetEventPayload } from "./protocol.js";
import { getTracer } from "../telemetry/spans.js";

// Re-export with parsed payload for convenience
export interface OutboxEvent {
  eventId: number;
  ts: string;
  type: string;
  projectId: string | null;
  briefingId: number | null;
  payload: unknown;
  delivered: boolean;
}

/**
 * Convert DB event to OutboxEvent with parsed payload.
 */
function toOutboxEvent(dbEvent: DbOutboxEvent): OutboxEvent {
  let payload: unknown;
  try {
    payload = dbEvent.payloadJson ? JSON.parse(dbEvent.payloadJson) : null;
  } catch {
    payload = dbEvent.payloadJson;
  }
  return {
    eventId: dbEvent.eventId,
    ts: dbEvent.ts,
    type: dbEvent.type,
    projectId: dbEvent.projectId,
    briefingId: dbEvent.briefingId,
    payload,
    delivered: dbEvent.delivered ?? false,
  };
}

export type FleetEventListener = (event: FleetEventMessage) => void;

/**
 * Polls outbox and broadcasts events to subscribers.
 */
export class OutboxTailer {
  private outboxRepo: OutboxRepo;
  private cursor = 0;
  private pollInterval: NodeJS.Timeout | null = null;
  private listeners = new Set<FleetEventListener>();
  private running = false;

  constructor() {
    this.outboxRepo = new OutboxRepo();
  }

  /**
   * Start polling the outbox.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Initialize cursor to latest event
    this.cursor = this.outboxRepo.getLatestEventId();
    console.log(`[OUTBOX] Starting tailer from cursor ${this.cursor}`);

    // Start polling loop
    this.pollInterval = setInterval(() => {
      this.poll();
    }, OUTBOX_POLL_INTERVAL_MS);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.running = false;
    console.log("[OUTBOX] Tailer stopped");
  }

  /**
   * Subscribe to fleet events.
   */
  subscribe(listener: FleetEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get events after a cursor (for replay on new client connection).
   */
  getEventsAfter(cursor: number, limit = 100): FleetEventMessage[] {
    const dbEvents = this.outboxRepo.getAfterCursor(cursor, limit);
    return dbEvents.map((e) => this.toFleetEventMessage(toOutboxEvent(e)));
  }

  /**
   * Get the current cursor position.
   */
  getCursor(): number {
    return this.cursor;
  }

  /**
   * Poll for new events.
   * Note: Only creates a span when there are events to process (to avoid noisy telemetry).
   */
  private poll(): void {
    try {
      const dbEvents = this.outboxRepo.getAfterCursor(this.cursor, 100);

      // Skip span creation if no events (avoids noisy polling telemetry)
      if (dbEvents.length === 0) {
        return;
      }

      // Only trace when we have work to do
      const tracer = getTracer();
      const span = tracer.startSpan("outbox.poll", {
        attributes: {
          "outbox.cursor": this.cursor,
          "outbox.events_found": dbEvents.length,
        },
      });

      try {
        for (const dbEvent of dbEvents) {
          const event = toOutboxEvent(dbEvent);
          const message = this.toFleetEventMessage(event);
          this.broadcast(message);

          // Update cursor
          if (event.eventId > this.cursor) {
            this.cursor = event.eventId;
          }

          // Mark as delivered
          this.outboxRepo.markDelivered(event.eventId);
        }
      } finally {
        span.end();
      }
    } catch (error) {
      console.error("[OUTBOX] Poll error:", error);
    }
  }

  /**
   * Broadcast event to all listeners.
   */
  private broadcast(event: FleetEventMessage): void {
    const tracer = getTracer();
    const span = tracer.startSpan("outbox.broadcast", {
      attributes: {
        "outbox.event_id": event.event_id,
        "outbox.event_type": event.event.type,
        "outbox.listener_count": this.listeners.size,
      },
    });

    try {
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error("[OUTBOX] Listener error:", error);
        }
      }
    } finally {
      span.end();
    }
  }

  /**
   * Convert outbox row to FleetEventMessage.
   */
  private toFleetEventMessage(event: OutboxEvent): FleetEventMessage {
    const fleetPayload: FleetEventPayload = {
      type: event.type as FleetEventPayload["type"],
      project_id: event.projectId ?? undefined,
      briefing_id: event.briefingId ?? undefined,
      data: event.payload,
    };

    return {
      type: "fleet.event",
      event_id: event.eventId,
      ts: event.ts,
      event: fleetPayload,
    };
  }
}
