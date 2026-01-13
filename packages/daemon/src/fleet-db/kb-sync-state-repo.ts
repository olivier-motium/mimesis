/**
 * Repository for KB sync state persistence.
 * Tracks knowledge base synchronization status per project/branch.
 */

import { eq, and, lt, sql } from "drizzle-orm";
import { getFleetDb, schema } from "./index.js";
import type { KbSyncState, NewKbSyncState } from "./schema.js";

/** Sync type constants */
export const SYNC_TYPE = {
  FULL: "full",
  INCREMENTAL: "incremental",
} as const;

export type SyncType = (typeof SYNC_TYPE)[keyof typeof SYNC_TYPE];

/**
 * Repository for managing KB sync state in the Fleet database.
 */
export class KbSyncStateRepo {
  /**
   * Get sync state for a specific project and branch.
   */
  getSyncState(projectId: string, branch: string = "main"): KbSyncState | undefined {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.kbSyncState)
      .where(
        and(
          eq(schema.kbSyncState.projectId, projectId),
          eq(schema.kbSyncState.branch, branch)
        )
      )
      .get();
  }

  /**
   * Upsert sync state for a project/branch.
   * Creates new record or updates existing.
   */
  upsertSyncState(
    projectId: string,
    branch: string,
    data: {
      lastCommitSeen?: string | null;
      lastSyncAt: string;
      syncType: SyncType;
      filesProcessed: number;
    }
  ): KbSyncState {
    const db = getFleetDb();
    const now = new Date().toISOString();
    const existing = this.getSyncState(projectId, branch);

    if (existing) {
      // Update existing record
      db.update(schema.kbSyncState)
        .set({
          lastCommitSeen: data.lastCommitSeen,
          lastSyncAt: data.lastSyncAt,
          syncType: data.syncType,
          filesProcessed: data.filesProcessed,
          updatedAt: now,
        })
        .where(eq(schema.kbSyncState.id, existing.id))
        .run();

      return this.getSyncState(projectId, branch)!;
    } else {
      // Insert new record
      db.insert(schema.kbSyncState)
        .values({
          projectId,
          branch,
          lastCommitSeen: data.lastCommitSeen,
          lastSyncAt: data.lastSyncAt,
          syncType: data.syncType,
          filesProcessed: data.filesProcessed,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      return this.getSyncState(projectId, branch)!;
    }
  }

  /**
   * Get all sync states across all projects.
   */
  getAllSyncStates(): KbSyncState[] {
    const db = getFleetDb();
    return db.select().from(schema.kbSyncState).all();
  }

  /**
   * Get projects with stale sync state (older than daysOld days).
   * Returns sync states where lastSyncAt is more than daysOld days ago.
   */
  getStaleProjects(daysOld: number): KbSyncState[] {
    const db = getFleetDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffIso = cutoffDate.toISOString();

    return db
      .select()
      .from(schema.kbSyncState)
      .where(lt(schema.kbSyncState.lastSyncAt, cutoffIso))
      .all();
  }

  /**
   * Get sync state by project ID (all branches).
   */
  getByProject(projectId: string): KbSyncState[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.kbSyncState)
      .where(eq(schema.kbSyncState.projectId, projectId))
      .all();
  }

  /**
   * Delete sync state for a project/branch.
   */
  delete(projectId: string, branch: string = "main"): void {
    const db = getFleetDb();
    db.delete(schema.kbSyncState)
      .where(
        and(
          eq(schema.kbSyncState.projectId, projectId),
          eq(schema.kbSyncState.branch, branch)
        )
      )
      .run();
  }

  /**
   * Delete all sync states for a project (all branches).
   */
  deleteAllForProject(projectId: string): void {
    const db = getFleetDb();
    db.delete(schema.kbSyncState)
      .where(eq(schema.kbSyncState.projectId, projectId))
      .run();
  }

  /**
   * Check if a project has ever been synced.
   */
  hasBeenSynced(projectId: string, branch: string = "main"): boolean {
    return this.getSyncState(projectId, branch) !== undefined;
  }

  /**
   * Check if a project's sync is stale (older than daysOld days).
   */
  isStale(projectId: string, branch: string = "main", daysOld: number = 7): boolean {
    const state = this.getSyncState(projectId, branch);
    if (!state) return true; // Never synced = stale

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const lastSync = new Date(state.lastSyncAt);

    return lastSync < cutoffDate;
  }
}
