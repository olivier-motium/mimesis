/**
 * Repository for briefing persistence.
 * Manages session completion briefings with idempotent insert.
 */

import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { getFleetDb, schema } from "./index.js";
import type { Briefing, NewBriefing } from "./schema.js";

export interface BriefingFilter {
  projectId?: string;
  sessionId?: string;
  status?: string;
  impactLevel?: string;
  limit?: number;
  offset?: number;
}

/**
 * Repository for managing briefings in the Fleet database.
 */
export class BriefingRepo {
  /**
   * Get a briefing by ID.
   */
  get(briefingId: number): Briefing | undefined {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.briefingId, briefingId))
      .get();
  }

  /**
   * Get briefings for a project, ordered by creation time (newest first).
   */
  getByProject(projectId: string, limit = 50): Briefing[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.projectId, projectId))
      .orderBy(desc(schema.briefings.createdAt))
      .limit(limit)
      .all();
  }

  /**
   * Get briefings for a session.
   */
  getBySession(sessionId: string): Briefing[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.sessionId, sessionId))
      .orderBy(desc(schema.briefings.createdAt))
      .all();
  }

  /**
   * Get recent briefings across all projects.
   */
  getRecent(limit = 20): Briefing[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.briefings)
      .orderBy(desc(schema.briefings.createdAt))
      .limit(limit)
      .all();
  }

  /**
   * Query briefings with filters.
   */
  query(filter: BriefingFilter): Briefing[] {
    const db = getFleetDb();
    const conditions: ReturnType<typeof eq>[] = [];

    if (filter.projectId) {
      conditions.push(eq(schema.briefings.projectId, filter.projectId));
    }
    if (filter.sessionId) {
      conditions.push(eq(schema.briefings.sessionId, filter.sessionId));
    }
    if (filter.status) {
      conditions.push(eq(schema.briefings.status, filter.status));
    }
    if (filter.impactLevel) {
      conditions.push(eq(schema.briefings.impactLevel, filter.impactLevel));
    }

    let query = db
      .select()
      .from(schema.briefings)
      .orderBy(desc(schema.briefings.createdAt));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    if (filter.limit) {
      query = query.limit(filter.limit) as typeof query;
    }
    if (filter.offset) {
      query = query.offset(filter.offset) as typeof query;
    }

    return query.all();
  }

  /**
   * Insert a new briefing.
   * Uses ON CONFLICT IGNORE for idempotent insert based on unique constraint.
   *
   * @returns The briefing ID, or undefined if already exists
   */
  insert(briefing: Omit<NewBriefing, "createdAt">): number | undefined {
    const db = getFleetDb();
    const now = new Date().toISOString();

    // Use raw SQL for INSERT OR IGNORE since Drizzle doesn't support it directly
    const result = db
      .insert(schema.briefings)
      .values({
        ...briefing,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();

    // Return the last inserted ID if a row was inserted
    if (result.changes > 0) {
      return Number(result.lastInsertRowid);
    }

    return undefined;
  }

  /**
   * Insert or update a briefing (upsert).
   * Updates all fields except the primary key on conflict.
   *
   * @returns The briefing ID
   */
  upsert(briefing: Omit<NewBriefing, "createdAt">): number {
    const db = getFleetDb();
    const now = new Date().toISOString();

    // First try to find existing by unique constraint
    const existing = db
      .select({ briefingId: schema.briefings.briefingId })
      .from(schema.briefings)
      .where(
        and(
          eq(schema.briefings.projectId, briefing.projectId),
          briefing.sessionId
            ? eq(schema.briefings.sessionId, briefing.sessionId)
            : sql`${schema.briefings.sessionId} IS NULL`,
          briefing.taskId
            ? eq(schema.briefings.taskId, briefing.taskId)
            : sql`${schema.briefings.taskId} IS NULL`,
          briefing.endedAt
            ? eq(schema.briefings.endedAt, briefing.endedAt)
            : sql`${schema.briefings.endedAt} IS NULL`
        )
      )
      .get();

    if (existing) {
      // Update existing
      db.update(schema.briefings)
        .set({
          status: briefing.status,
          startedAt: briefing.startedAt,
          impactLevel: briefing.impactLevel,
          broadcastLevel: briefing.broadcastLevel,
          docDriftRisk: briefing.docDriftRisk,
          baseCommit: briefing.baseCommit,
          headCommit: briefing.headCommit,
          branch: briefing.branch,
          blockersJson: briefing.blockersJson,
          nextStepsJson: briefing.nextStepsJson,
          docsTouchedJson: briefing.docsTouchedJson,
          filesTouchedJson: briefing.filesTouchedJson,
          rawMarkdown: briefing.rawMarkdown,
        })
        .where(eq(schema.briefings.briefingId, existing.briefingId))
        .run();
      return existing.briefingId;
    }

    // Insert new
    const result = db
      .insert(schema.briefings)
      .values({
        ...briefing,
        createdAt: now,
      })
      .run();

    return Number(result.lastInsertRowid);
  }

  /**
   * Update a briefing's semantic fields (from Sonnet finalization).
   */
  updateSemanticFields(
    briefingId: number,
    fields: {
      impactLevel?: string;
      broadcastLevel?: string;
      docDriftRisk?: string;
      blockersJson?: string;
      nextStepsJson?: string;
      docsTouchedJson?: string;
      filesTouchedJson?: string;
    }
  ): void {
    const db = getFleetDb();
    db.update(schema.briefings).set(fields).where(eq(schema.briefings.briefingId, briefingId)).run();
  }

  /**
   * Delete a briefing by ID.
   */
  delete(briefingId: number): void {
    const db = getFleetDb();
    db.delete(schema.briefings).where(eq(schema.briefings.briefingId, briefingId)).run();
  }

  /**
   * Count briefings for a project.
   */
  countByProject(projectId: string): number {
    const db = getFleetDb();
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.briefings)
      .where(eq(schema.briefings.projectId, projectId))
      .get();
    return result?.count ?? 0;
  }

  /**
   * Get briefings with high doc drift risk.
   */
  getHighDocDriftRisk(limit = 10): Briefing[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.briefings)
      .where(eq(schema.briefings.docDriftRisk, "high"))
      .orderBy(desc(schema.briefings.createdAt))
      .limit(limit)
      .all();
  }

  /**
   * Count briefings for a project since a given date.
   * More efficient than fetching all and filtering in JS.
   */
  countByProjectSince(projectId: string, since: Date): number {
    const db = getFleetDb();
    const sinceStr = since.toISOString();
    const result = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.briefings)
      .where(
        and(
          eq(schema.briefings.projectId, projectId),
          sql`${schema.briefings.createdAt} >= ${sinceStr}`
        )
      )
      .get();
    return result?.count ?? 0;
  }

  /**
   * Batch count briefings since a date for multiple projects.
   * Returns a Map of projectId -> count.
   * Single SQL query instead of N queries.
   */
  countByProjectsSince(
    projectIds: string[],
    since: Date
  ): Map<string, number> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const db = getFleetDb();
    const sinceStr = since.toISOString();

    // Use Drizzle's inArray for proper parameterized query
    const results = db
      .select({
        projectId: schema.briefings.projectId,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.briefings)
      .where(
        and(
          inArray(schema.briefings.projectId, projectIds),
          sql`${schema.briefings.createdAt} >= ${sinceStr}`
        )
      )
      .groupBy(schema.briefings.projectId)
      .all();

    const countMap = new Map<string, number>();
    // Initialize all projectIds with 0
    for (const id of projectIds) {
      countMap.set(id, 0);
    }
    // Set actual counts
    for (const row of results) {
      countMap.set(row.projectId, row.count);
    }

    return countMap;
  }
}
