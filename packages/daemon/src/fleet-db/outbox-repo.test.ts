/**
 * Outbox Repository Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, gt } from "drizzle-orm";
import {
  createTestDb,
  type TestDbContext,
  createOutboxEventFixture,
} from "../test-utils/fleet-db-helpers.js";
import * as schema from "./schema.js";
import { OUTBOX_EVENT_TYPE } from "../config/fleet.js";

describe("OutboxRepo (DB operations)", () => {
  let ctx: TestDbContext;

  beforeAll(() => {
    ctx = createTestDb();
  });

  afterAll(() => {
    ctx.close();
  });

  beforeEach(() => {
    ctx.sqlite.exec("DELETE FROM outbox_events;");
  });

  it("inserts event with auto-generated timestamp", () => {
    const before = new Date().toISOString();

    const event = createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED);
    const result = ctx.db.insert(schema.outboxEvents).values(event).run();

    expect(result.changes).toBe(1);

    const inserted = ctx.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventId, Number(result.lastInsertRowid)))
      .get();

    expect(inserted).toBeDefined();
    expect(inserted?.ts).toBeDefined();
    expect(inserted?.ts >= before).toBe(true);
  });

  it("returns events after cursor in ID order", () => {
    // Insert multiple events
    for (let i = 0; i < 5; i++) {
      ctx.db
        .insert(schema.outboxEvents)
        .values(createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED))
        .run();
    }

    const allEvents = ctx.db
      .select()
      .from(schema.outboxEvents)
      .orderBy(schema.outboxEvents.eventId)
      .all();

    expect(allEvents.length).toBe(5);

    // Get events after the second one
    const cursor = allEvents[1].eventId;
    const afterCursor = ctx.db
      .select()
      .from(schema.outboxEvents)
      .where(gt(schema.outboxEvents.eventId, cursor))
      .orderBy(schema.outboxEvents.eventId)
      .all();

    expect(afterCursor.length).toBe(3);
    expect(afterCursor[0].eventId).toBe(allEvents[2].eventId);
  });

  it("marks events as delivered", () => {
    const event = createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED, {
      delivered: false,
    });
    const result = ctx.db.insert(schema.outboxEvents).values(event).run();
    const eventId = Number(result.lastInsertRowid);

    // Verify undelivered
    let fetched = ctx.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventId, eventId))
      .get();
    expect(fetched?.delivered).toBe(false);

    // Mark as delivered
    ctx.db
      .update(schema.outboxEvents)
      .set({ delivered: true })
      .where(eq(schema.outboxEvents.eventId, eventId))
      .run();

    // Verify delivered
    fetched = ctx.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventId, eventId))
      .get();
    expect(fetched?.delivered).toBe(true);
  });

  it("cleans up old delivered events", () => {
    const oldTs = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
    const newTs = new Date().toISOString();

    // Insert old delivered event
    ctx.db
      .insert(schema.outboxEvents)
      .values({
        ...createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED),
        ts: oldTs,
        delivered: true,
      })
      .run();

    // Insert new delivered event
    ctx.db
      .insert(schema.outboxEvents)
      .values({
        ...createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED),
        ts: newTs,
        delivered: true,
      })
      .run();

    // Insert old undelivered event (should NOT be deleted)
    ctx.db
      .insert(schema.outboxEvents)
      .values({
        ...createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED),
        ts: oldTs,
        delivered: false,
      })
      .run();

    // Cleanup events older than 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const deleted = ctx.sqlite.prepare(
      "DELETE FROM outbox_events WHERE delivered = 1 AND ts < ?"
    ).run(cutoff);

    expect(deleted.changes).toBe(1);

    // Verify remaining events
    const remaining = ctx.db.select().from(schema.outboxEvents).all();
    expect(remaining.length).toBe(2);
  });

  it("preserves undelivered events indefinitely", () => {
    const oldTs = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago

    ctx.db
      .insert(schema.outboxEvents)
      .values({
        ...createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED),
        ts: oldTs,
        delivered: false,
      })
      .run();

    // Cleanup only delivered events
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    ctx.sqlite.prepare(
      "DELETE FROM outbox_events WHERE delivered = 1 AND ts < ?"
    ).run(cutoff);

    // Old undelivered event should still exist
    const undelivered = ctx.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.delivered, false))
      .all();

    expect(undelivered.length).toBe(1);
  });

  it("stores correct event types", () => {
    ctx.db
      .insert(schema.outboxEvents)
      .values(createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED))
      .run();

    ctx.db
      .insert(schema.outboxEvents)
      .values(createOutboxEventFixture(OUTBOX_EVENT_TYPE.JOB_COMPLETED))
      .run();

    ctx.db
      .insert(schema.outboxEvents)
      .values(createOutboxEventFixture(OUTBOX_EVENT_TYPE.ERROR))
      .run();

    const events = ctx.db.select().from(schema.outboxEvents).all();
    const types = events.map((e) => e.type);

    expect(types).toContain(OUTBOX_EVENT_TYPE.BRIEFING_ADDED);
    expect(types).toContain(OUTBOX_EVENT_TYPE.JOB_COMPLETED);
    expect(types).toContain(OUTBOX_EVENT_TYPE.ERROR);
  });

  it("parses JSON payload correctly", () => {
    const payload = { briefing: { briefingId: 1, projectId: "test", status: "completed" } };

    ctx.db
      .insert(schema.outboxEvents)
      .values({
        ...createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED),
        payloadJson: JSON.stringify(payload),
      })
      .run();

    const event = ctx.db.select().from(schema.outboxEvents).get();
    const parsed = JSON.parse(event!.payloadJson);

    expect(parsed.briefing.briefingId).toBe(1);
    expect(parsed.briefing.status).toBe("completed");
  });

  it("counts undelivered events", () => {
    // Insert mix of delivered and undelivered
    for (let i = 0; i < 3; i++) {
      ctx.db
        .insert(schema.outboxEvents)
        .values(createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED, { delivered: false }))
        .run();
    }
    for (let i = 0; i < 2; i++) {
      ctx.db
        .insert(schema.outboxEvents)
        .values(createOutboxEventFixture(OUTBOX_EVENT_TYPE.BRIEFING_ADDED, { delivered: true }))
        .run();
    }

    const result = ctx.sqlite.prepare(
      "SELECT COUNT(*) as count FROM outbox_events WHERE delivered = 0"
    ).get() as { count: number };

    expect(result.count).toBe(3);
  });
});
