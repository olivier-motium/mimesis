/**
 * Repository for project persistence.
 * Manages project identity and registration in SQLite.
 */

import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { getFleetDb, schema } from "./index.js";
import type { Project, NewProject } from "./schema.js";

/**
 * Generate a project ID from repo name and git remote.
 * Format: {repo_name}__{8-char-hash}
 *
 * The hash ensures uniqueness when multiple repos have the same name
 * (e.g., forks, same-name projects in different orgs).
 */
export function generateProjectId(repoName: string, gitRemote?: string): string {
  const hashInput = gitRemote ? `${repoName}:${gitRemote}` : repoName;
  const hash = crypto
    .createHash("sha256")
    .update(hashInput)
    .digest("hex")
    .substring(0, 8);

  // Sanitize repo name: lowercase, replace non-alphanumeric with dash
  const sanitized = repoName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${sanitized}__${hash}`;
}

/**
 * Repository for managing projects in the Fleet database.
 */
export class ProjectRepo {
  /**
   * Get a project by ID.
   */
  get(projectId: string): Project | undefined {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.projectId, projectId))
      .get();
  }

  /**
   * Get all projects.
   */
  getAll(): Project[] {
    const db = getFleetDb();
    return db.select().from(schema.projects).all();
  }

  /**
   * Get all active projects.
   */
  getActive(): Project[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.status, "active"))
      .all();
  }

  /**
   * Find a project by repo root path.
   */
  findByRepoRoot(repoRoot: string): Project | undefined {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.repoRoot, repoRoot))
      .get();
  }

  /**
   * Insert a new project.
   * Returns the project ID.
   */
  insert(project: Omit<NewProject, "createdAt" | "updatedAt">): string {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.insert(schema.projects)
      .values({
        ...project,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return project.projectId;
  }

  /**
   * Insert or update a project (upsert).
   * Returns the project ID.
   */
  upsert(project: Omit<NewProject, "createdAt" | "updatedAt">): string {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.insert(schema.projects)
      .values({
        ...project,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.projects.projectId,
        set: {
          repoName: project.repoName,
          repoRoot: project.repoRoot,
          gitRemote: project.gitRemote,
          status: project.status,
          updatedAt: now,
        },
      })
      .run();

    return project.projectId;
  }

  /**
   * Update a project's status.
   */
  updateStatus(projectId: string, status: string): void {
    const db = getFleetDb();
    db.update(schema.projects)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.projects.projectId, projectId))
      .run();
  }

  /**
   * Archive a project (soft delete).
   */
  archive(projectId: string): void {
    this.updateStatus(projectId, "archived");
  }

  /**
   * Ensure a project exists, creating it if necessary.
   * Convenience method for ingestion flow.
   *
   * @returns The project ID
   */
  ensureProject(params: {
    repoName: string;
    repoRoot: string;
    gitRemote?: string;
  }): string {
    const projectId = generateProjectId(params.repoName, params.gitRemote);

    // Check if already exists
    const existing = this.get(projectId);
    if (existing) {
      return projectId;
    }

    // Create new project
    this.insert({
      projectId,
      repoName: params.repoName,
      repoRoot: params.repoRoot,
      gitRemote: params.gitRemote,
      status: "active",
    });

    return projectId;
  }
}
