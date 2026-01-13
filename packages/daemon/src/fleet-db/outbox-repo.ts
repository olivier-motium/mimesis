/**
 * Repository for outbox event persistence.
 * Manages the event queue for push + replay delivery.
 */

import { eq, gt, and, desc, sql } from "drizzle-orm";
import { getFleetDb, schema } from "./index.js";
import type { OutboxEvent, NewOutboxEvent } from "./schema.js";
import { OUTBOX_EVENT_TYPE } from "../config/fleet.js";
import { getTracer } from "../telemetry/spans.js";

export interface OutboxEventPayload {
  briefing?: {
    briefingId: number;
    projectId: string;
    status: string;
    impactLevel?: string;
    broadcastLevel?: string;
  };
  session?: {
    sessionId: string;
    projectId: string;
    repoName: string;
    branch?: string;
  };
  docDrift?: {
    projectId: string;
    docPath: string;
    risk: string;
  };
  job?: {
    jobId: number;
    type: string;
    status: string;
    projectId?: string;
  };
  audit?: {
    target: string;
    topRecommendation: string;
    optionsCount: number;
    artifactPath: string;
  };
  error?: {
    message: string;
    code?: string;
    context?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/**
 * Repository for managing outbox events in the Fleet database.
 * Supports cursor-based delivery for client replay.
 */
export class OutboxRepo {
  /**
   * Get an event by ID.
   */
  get(eventId: number): OutboxEvent | undefined {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventId, eventId))
      .get();
  }

  /**
   * Get events after a cursor (for replay).
   * Cursor is the last event_id the client has seen.
   */
  getAfterCursor(cursor: number, limit = 100): OutboxEvent[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.outboxEvents)
      .where(gt(schema.outboxEvents.eventId, cursor))
      .orderBy(schema.outboxEvents.eventId)
      .limit(limit)
      .all();
  }

  /**
   * Get all undelivered events.
   */
  getUndelivered(limit = 100): OutboxEvent[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.delivered, false))
      .orderBy(schema.outboxEvents.eventId)
      .limit(limit)
      .all();
  }

  /**
   * Get the most recent event ID (for initial client cursor).
   */
  getLatestEventId(): number {
    const db = getFleetDb();
    const result = db
      .select({ maxId: sql<number>`MAX(event_id)` })
      .from(schema.outboxEvents)
      .get();
    return result?.maxId ?? 0;
  }

  /**
   * Insert a new event.
   * Returns the event ID.
   */
  insert(event: Omit<NewOutboxEvent, "ts" | "delivered">): number {
    const tracer = getTracer();
    const span = tracer.startSpan("outbox.insert", {
      attributes: {
        "outbox.event_type": event.type,
        "outbox.project_id": event.projectId ?? "unknown",
      },
    });

    try {
      const db = getFleetDb();
      const now = new Date().toISOString();

      const result = db
        .insert(schema.outboxEvents)
        .values({
          ...event,
          ts: now,
          delivered: false,
        })
        .run();

      const eventId = Number(result.lastInsertRowid);
      span.setAttribute("outbox.event_id", eventId);
      return eventId;
    } finally {
      span.end();
    }
  }

  /**
   * Insert a briefing_added event.
   */
  insertBriefingAdded(
    briefingId: number,
    projectId: string,
    payload: OutboxEventPayload,
    broadcastLevel?: string
  ): number {
    return this.insert({
      type: OUTBOX_EVENT_TYPE.BRIEFING_ADDED,
      projectId,
      briefingId,
      broadcastLevel: broadcastLevel ?? null,
      payloadJson: JSON.stringify(payload),
    });
  }

  /**
   * Insert a session_started event.
   * Used for roster awareness - typically broadcast_level: silent.
   */
  insertSessionStarted(
    sessionId: string,
    projectId: string,
    payload: OutboxEventPayload,
    broadcastLevel: string = "silent"
  ): number {
    return this.insert({
      type: OUTBOX_EVENT_TYPE.SESSION_STARTED,
      projectId,
      briefingId: null,
      broadcastLevel,
      payloadJson: JSON.stringify({ ...payload, sessionId }),
    });
  }

  /**
   * Insert a session_blocked event.
   * Used for alerting Commander to blocked sessions.
   */
  insertSessionBlocked(
    sessionId: string,
    projectId: string,
    payload: OutboxEventPayload,
    broadcastLevel: string = "mention"
  ): number {
    return this.insert({
      type: OUTBOX_EVENT_TYPE.SESSION_BLOCKED,
      projectId,
      briefingId: null,
      broadcastLevel,
      payloadJson: JSON.stringify({ ...payload, sessionId }),
    });
  }

  /**
   * Insert a doc_drift_warning event.
   * Used for alerting Commander to high doc drift risk.
   */
  insertDocDriftWarning(
    projectId: string,
    docPath: string,
    payload: OutboxEventPayload,
    broadcastLevel: string = "mention"
  ): number {
    return this.insert({
      type: OUTBOX_EVENT_TYPE.DOC_DRIFT_WARNING,
      projectId,
      briefingId: null,
      broadcastLevel,
      payloadJson: JSON.stringify({ ...payload, docDrift: { projectId, docPath, risk: "high" } }),
    });
  }

  /**
   * Insert a job_completed event.
   */
  insertJobCompleted(
    jobId: number,
    projectId: string | undefined,
    payload: OutboxEventPayload
  ): number {
    return this.insert({
      type: OUTBOX_EVENT_TYPE.JOB_COMPLETED,
      projectId: projectId ?? null,
      briefingId: null,
      payloadJson: JSON.stringify({ ...payload, jobId }),
    });
  }

  /**
   * Insert an audit_completed event.
   * Used to notify Commander that an audit has completed.
   *
   * @param projectId - The project that was audited
   * @param target - The audit target (e.g., "src/gateway")
   * @param payload - Audit result details (topRecommendation, optionsCount, artifactPath)
   * @param broadcastLevel - Visibility level ("mention" or "highlight")
   */
  insertAuditCompleted(
    projectId: string,
    target: string,
    payload: {
      topRecommendation: string;
      optionsCount: number;
      artifactPath: string;
    },
    broadcastLevel: "mention" | "highlight" = "mention"
  ): number {
    return this.insert({
      type: OUTBOX_EVENT_TYPE.AUDIT_COMPLETED,
      projectId,
      briefingId: null,
      broadcastLevel,
      payloadJson: JSON.stringify({
        audit: {
          target,
          ...payload,
        },
      }),
    });
  }

  /**
   * Insert an error event.
   */
  insertError(
    projectId: string | undefined,
    message: string,
    context?: Record<string, unknown>
  ): number {
    return this.insert({
      type: OUTBOX_EVENT_TYPE.ERROR,
      projectId: projectId ?? null,
      briefingId: null,
      payloadJson: JSON.stringify({
        error: { message, context },
      }),
    });
  }

  /**
   * Mark an event as delivered.
   */
  markDelivered(eventId: number): void {
    const db = getFleetDb();
    db.update(schema.outboxEvents)
      .set({ delivered: true })
      .where(eq(schema.outboxEvents.eventId, eventId))
      .run();
  }

  /**
   * Mark multiple events as delivered.
   */
  markManyDelivered(eventIds: number[]): void {
    if (eventIds.length === 0) return;

    const db = getFleetDb();
    // Use raw SQL for IN clause
    const placeholders = eventIds.map(() => "?").join(",");
    const stmt = db.$client.prepare(
      `UPDATE outbox_events SET delivered = 1 WHERE event_id IN (${placeholders})`
    );
    stmt.run(...eventIds);
  }

  /**
   * Delete old delivered events (cleanup).
   * Keeps events for a configurable retention period.
   */
  cleanupOldDelivered(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const db = getFleetDb();
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();

    const result = db
      .delete(schema.outboxEvents)
      .where(
        and(
          eq(schema.outboxEvents.delivered, true),
          sql`${schema.outboxEvents.ts} < ${cutoff}`
        )
      )
      .run();

    return result.changes;
  }

  /**
   * Get events for a specific project.
   */
  getByProject(projectId: string, limit = 50): OutboxEvent[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.projectId, projectId))
      .orderBy(desc(schema.outboxEvents.eventId))
      .limit(limit)
      .all();
  }

  /**
   * Count undelivered events.
   */
  countUndelivered(): number {
    const db = getFleetDb();
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.delivered, false))
      .get();
    return result?.count ?? 0;
  }
}
