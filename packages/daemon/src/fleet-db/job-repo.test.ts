/**
 * Job Repository Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  createTestDb,
  type TestDbContext,
  createJobFixture,
} from "../test-utils/fleet-db-helpers.js";
import * as schema from "./schema.js";
import { JOB_STATUS, JOB_TYPE, MODEL } from "../config/fleet.js";

describe("JobRepo (DB operations)", () => {
  let ctx: TestDbContext;

  beforeAll(() => {
    ctx = createTestDb();
  });

  afterAll(() => {
    ctx.close();
  });

  beforeEach(() => {
    ctx.sqlite.exec("DELETE FROM jobs;");
  });

  it("creates job in queued status", () => {
    const job = createJobFixture({ status: JOB_STATUS.QUEUED });
    const result = ctx.db.insert(schema.jobs).values(job).run();

    const inserted = ctx.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.jobId, Number(result.lastInsertRowid)))
      .get();

    expect(inserted).toBeDefined();
    expect(inserted?.status).toBe(JOB_STATUS.QUEUED);
    expect(inserted?.tsStarted).toBeNull();
    expect(inserted?.tsFinished).toBeNull();
  });

  it("transitions through status lifecycle", () => {
    const job = createJobFixture();
    const result = ctx.db.insert(schema.jobs).values(job).run();
    const jobId = Number(result.lastInsertRowid);

    // Start the job
    const startTime = new Date().toISOString();
    ctx.db
      .update(schema.jobs)
      .set({ status: JOB_STATUS.RUNNING, tsStarted: startTime })
      .where(eq(schema.jobs.jobId, jobId))
      .run();

    let updated = ctx.db.select().from(schema.jobs).where(eq(schema.jobs.jobId, jobId)).get();
    expect(updated?.status).toBe(JOB_STATUS.RUNNING);
    expect(updated?.tsStarted).toBe(startTime);

    // Complete the job
    const finishTime = new Date().toISOString();
    ctx.db
      .update(schema.jobs)
      .set({
        status: JOB_STATUS.COMPLETED,
        tsFinished: finishTime,
        resultJson: JSON.stringify({ success: true, output: "Done" }),
      })
      .where(eq(schema.jobs.jobId, jobId))
      .run();

    updated = ctx.db.select().from(schema.jobs).where(eq(schema.jobs.jobId, jobId)).get();
    expect(updated?.status).toBe(JOB_STATUS.COMPLETED);
    expect(updated?.tsFinished).toBe(finishTime);
  });

  it("appends stream chunks incrementally", () => {
    const job = createJobFixture({ status: JOB_STATUS.RUNNING });
    const result = ctx.db.insert(schema.jobs).values(job).run();
    const jobId = Number(result.lastInsertRowid);

    // Append first batch
    const chunks1 = [{ type: "text", content: "Hello" }];
    ctx.db
      .update(schema.jobs)
      .set({ streamChunksJson: JSON.stringify(chunks1) })
      .where(eq(schema.jobs.jobId, jobId))
      .run();

    // Append second batch
    let current = ctx.db.select().from(schema.jobs).where(eq(schema.jobs.jobId, jobId)).get();
    const existing = JSON.parse(current!.streamChunksJson!);
    const chunks2 = [{ type: "text", content: " World" }];
    const combined = [...existing, ...chunks2];

    ctx.db
      .update(schema.jobs)
      .set({ streamChunksJson: JSON.stringify(combined) })
      .where(eq(schema.jobs.jobId, jobId))
      .run();

    current = ctx.db.select().from(schema.jobs).where(eq(schema.jobs.jobId, jobId)).get();
    const parsed = JSON.parse(current!.streamChunksJson!);
    expect(parsed.length).toBe(2);
    expect(parsed[0].content).toBe("Hello");
    expect(parsed[1].content).toBe(" World");
  });

  it("returns commander history in order", () => {
    // Insert commander turns at different times
    for (let i = 0; i < 3; i++) {
      const ts = new Date(Date.now() + i * 1000).toISOString();
      ctx.db
        .insert(schema.jobs)
        .values(
          createJobFixture({
            type: JOB_TYPE.COMMANDER_TURN,
            status: JOB_STATUS.COMPLETED,
            tsCreated: ts,
          })
        )
        .run();
    }

    const history = ctx.db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.type, JOB_TYPE.COMMANDER_TURN),
          eq(schema.jobs.status, JOB_STATUS.COMPLETED)
        )
      )
      .orderBy(schema.jobs.tsCreated)
      .all();

    expect(history.length).toBe(3);
    // Should be in chronological order
    expect(new Date(history[0].tsCreated) <= new Date(history[1].tsCreated)).toBe(true);
    expect(new Date(history[1].tsCreated) <= new Date(history[2].tsCreated)).toBe(true);
  });

  it("recovers stale running jobs on startup", () => {
    // Insert "stale" running jobs (simulating crash)
    for (let i = 0; i < 2; i++) {
      ctx.db
        .insert(schema.jobs)
        .values(createJobFixture({ status: JOB_STATUS.RUNNING }))
        .run();
    }

    // Also insert a queued job (should not be affected)
    ctx.db
      .insert(schema.jobs)
      .values(createJobFixture({ status: JOB_STATUS.QUEUED }))
      .run();

    // Recover stale running jobs
    const now = new Date().toISOString();
    const recovered = ctx.db
      .update(schema.jobs)
      .set({
        status: JOB_STATUS.FAILED,
        tsFinished: now,
        error: "Job interrupted by daemon restart",
      })
      .where(eq(schema.jobs.status, JOB_STATUS.RUNNING))
      .run();

    expect(recovered.changes).toBe(2);

    // Verify running jobs are now failed
    const running = ctx.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, JOB_STATUS.RUNNING))
      .all();
    expect(running.length).toBe(0);

    // Verify failed jobs have error message
    const failed = ctx.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, JOB_STATUS.FAILED))
      .all();
    expect(failed.length).toBe(2);
    expect(failed[0].error).toContain("daemon restart");

    // Verify queued job is unaffected
    const queued = ctx.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, JOB_STATUS.QUEUED))
      .all();
    expect(queued.length).toBe(1);
  });

  it("cleans up old completed jobs", () => {
    const oldTs = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago
    const newTs = new Date().toISOString();

    // Old completed job (should be deleted)
    ctx.db
      .insert(schema.jobs)
      .values(createJobFixture({ status: JOB_STATUS.COMPLETED, tsCreated: oldTs }))
      .run();

    // New completed job (should remain)
    ctx.db
      .insert(schema.jobs)
      .values(createJobFixture({ status: JOB_STATUS.COMPLETED, tsCreated: newTs }))
      .run();

    // Old queued job (should remain - active jobs not deleted)
    ctx.db
      .insert(schema.jobs)
      .values(createJobFixture({ status: JOB_STATUS.QUEUED, tsCreated: oldTs }))
      .run();

    // Cleanup jobs older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const deleted = ctx.sqlite.prepare(`
      DELETE FROM jobs
      WHERE status NOT IN ('queued', 'running')
      AND ts_created < ?
    `).run(cutoff);

    expect(deleted.changes).toBe(1);

    const remaining = ctx.db.select().from(schema.jobs).all();
    expect(remaining.length).toBe(2);
  });

  it("stores different job types", () => {
    ctx.db.insert(schema.jobs).values(createJobFixture({ type: JOB_TYPE.COMMANDER_TURN })).run();
    ctx.db.insert(schema.jobs).values(createJobFixture({ type: JOB_TYPE.WORKER_TASK })).run();
    ctx.db.insert(schema.jobs).values(createJobFixture({ type: JOB_TYPE.SKILL_PATCH })).run();

    const jobs = ctx.db.select().from(schema.jobs).all();
    const types = jobs.map((j) => j.type);

    expect(types).toContain(JOB_TYPE.COMMANDER_TURN);
    expect(types).toContain(JOB_TYPE.WORKER_TASK);
    expect(types).toContain(JOB_TYPE.SKILL_PATCH);
  });

  it("counts running jobs correctly", () => {
    ctx.db.insert(schema.jobs).values(createJobFixture({ status: JOB_STATUS.RUNNING })).run();
    ctx.db.insert(schema.jobs).values(createJobFixture({ status: JOB_STATUS.RUNNING })).run();
    ctx.db.insert(schema.jobs).values(createJobFixture({ status: JOB_STATUS.QUEUED })).run();
    ctx.db.insert(schema.jobs).values(createJobFixture({ status: JOB_STATUS.COMPLETED })).run();

    const result = ctx.sqlite.prepare(
      "SELECT COUNT(*) as count FROM jobs WHERE status = ?"
    ).get(JOB_STATUS.RUNNING) as { count: number };

    expect(result.count).toBe(2);
  });
});
