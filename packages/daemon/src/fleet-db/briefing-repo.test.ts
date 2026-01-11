/**
 * Briefing Repository Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, desc } from "drizzle-orm";
import {
  createTestDb,
  type TestDbContext,
  createProjectFixture,
  createBriefingFixture,
} from "../test-utils/fleet-db-helpers.js";
import * as schema from "./schema.js";
import { BRIEFING_STATUS, IMPACT_LEVEL, DOC_DRIFT_RISK } from "../config/fleet.js";

describe("BriefingRepo (DB operations)", () => {
  let ctx: TestDbContext;
  let testProjectId: string;

  beforeAll(() => {
    ctx = createTestDb();
  });

  afterAll(() => {
    ctx.close();
  });

  beforeEach(() => {
    ctx.sqlite.exec("DELETE FROM briefings; DELETE FROM projects;");
    // Create a test project for foreign key constraints
    const project = createProjectFixture();
    testProjectId = project.projectId;
    ctx.db.insert(schema.projects).values(project).run();
  });

  it("inserts briefing with all fields", () => {
    const briefing = createBriefingFixture(testProjectId);
    const result = ctx.db.insert(schema.briefings).values(briefing).run();

    expect(result.changes).toBe(1);

    const inserted = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.projectId, testProjectId))
      .get();

    expect(inserted).toBeDefined();
    expect(inserted?.projectId).toBe(testProjectId);
    expect(inserted?.status).toBe(BRIEFING_STATUS.COMPLETED);
    expect(inserted?.rawMarkdown).toContain("Summary");
  });

  it("returns undefined on duplicate insert (idempotent)", () => {
    const briefing = createBriefingFixture(testProjectId);

    // First insert succeeds
    const first = ctx.db.insert(schema.briefings).values(briefing).onConflictDoNothing().run();
    expect(first.changes).toBe(1);

    // Second insert with same unique key should be ignored
    const second = ctx.db.insert(schema.briefings).values(briefing).onConflictDoNothing().run();
    expect(second.changes).toBe(0);

    // Only one row should exist
    const count = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.projectId, testProjectId))
      .all();
    expect(count.length).toBe(1);
  });

  it("queries by projectId with pagination", () => {
    // Insert multiple briefings
    for (let i = 0; i < 5; i++) {
      const briefing = createBriefingFixture(testProjectId, {
        sessionId: `session-${i}`,
        endedAt: new Date(Date.now() + i * 1000).toISOString(),
      });
      ctx.db.insert(schema.briefings).values(briefing).run();
    }

    const results = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.projectId, testProjectId))
      .orderBy(desc(schema.briefings.createdAt))
      .limit(3)
      .all();

    expect(results.length).toBe(3);
  });

  it("queries by sessionId", () => {
    const sessionId = "unique-session-123";
    const briefing = createBriefingFixture(testProjectId, { sessionId });
    ctx.db.insert(schema.briefings).values(briefing).run();

    const result = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.sessionId, sessionId))
      .get();

    expect(result).toBeDefined();
    expect(result?.sessionId).toBe(sessionId);
  });

  it("updates semantic fields without erasing others", () => {
    const briefing = createBriefingFixture(testProjectId);
    ctx.db.insert(schema.briefings).values(briefing).run();

    const inserted = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.projectId, testProjectId))
      .get();

    // Update only semantic fields
    ctx.db
      .update(schema.briefings)
      .set({
        impactLevel: IMPACT_LEVEL.MAJOR,
        docDriftRisk: DOC_DRIFT_RISK.HIGH,
      })
      .where(eq(schema.briefings.briefingId, inserted!.briefingId))
      .run();

    const updated = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.briefingId, inserted!.briefingId))
      .get();

    expect(updated?.impactLevel).toBe(IMPACT_LEVEL.MAJOR);
    expect(updated?.docDriftRisk).toBe(DOC_DRIFT_RISK.HIGH);
    // Original fields preserved
    expect(updated?.rawMarkdown).toBe(briefing.rawMarkdown);
    expect(updated?.status).toBe(briefing.status);
  });

  it("filters by status and impactLevel", () => {
    // Insert briefings with different statuses and impact levels
    ctx.db
      .insert(schema.briefings)
      .values(
        createBriefingFixture(testProjectId, {
          sessionId: "s1",
          status: BRIEFING_STATUS.COMPLETED,
          impactLevel: IMPACT_LEVEL.MAJOR,
        })
      )
      .run();

    ctx.db
      .insert(schema.briefings)
      .values(
        createBriefingFixture(testProjectId, {
          sessionId: "s2",
          status: BRIEFING_STATUS.BLOCKED,
          impactLevel: IMPACT_LEVEL.MINOR,
        })
      )
      .run();

    ctx.db
      .insert(schema.briefings)
      .values(
        createBriefingFixture(testProjectId, {
          sessionId: "s3",
          status: BRIEFING_STATUS.COMPLETED,
          impactLevel: IMPACT_LEVEL.MINOR,
        })
      )
      .run();

    // Filter by status
    const completedOnly = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.status, BRIEFING_STATUS.COMPLETED))
      .all();
    expect(completedOnly.length).toBe(2);

    // Filter by impactLevel
    const majorOnly = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.impactLevel, IMPACT_LEVEL.MAJOR))
      .all();
    expect(majorOnly.length).toBe(1);
  });

  it("finds high doc drift risk briefings", () => {
    // Insert briefings with different doc drift risks
    ctx.db
      .insert(schema.briefings)
      .values(
        createBriefingFixture(testProjectId, {
          sessionId: "s1",
          docDriftRisk: DOC_DRIFT_RISK.HIGH,
        })
      )
      .run();

    ctx.db
      .insert(schema.briefings)
      .values(
        createBriefingFixture(testProjectId, {
          sessionId: "s2",
          docDriftRisk: DOC_DRIFT_RISK.LOW,
        })
      )
      .run();

    ctx.db
      .insert(schema.briefings)
      .values(
        createBriefingFixture(testProjectId, {
          sessionId: "s3",
          docDriftRisk: DOC_DRIFT_RISK.HIGH,
        })
      )
      .run();

    const highRisk = ctx.db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.docDriftRisk, DOC_DRIFT_RISK.HIGH))
      .orderBy(desc(schema.briefings.createdAt))
      .all();

    expect(highRisk.length).toBe(2);
  });

  it("counts briefings by project", () => {
    // Insert multiple briefings
    for (let i = 0; i < 3; i++) {
      ctx.db
        .insert(schema.briefings)
        .values(
          createBriefingFixture(testProjectId, {
            sessionId: `session-${i}`,
          })
        )
        .run();
    }

    const result = ctx.sqlite.prepare(
      "SELECT COUNT(*) as count FROM briefings WHERE project_id = ?"
    ).get(testProjectId) as { count: number };

    expect(result.count).toBe(3);
  });
});
