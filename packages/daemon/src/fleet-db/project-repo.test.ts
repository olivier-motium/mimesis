/**
 * Project Repository Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDbContext } from "../test-utils/fleet-db-helpers.js";
import { generateProjectId } from "./project-repo.js";
import * as schema from "./schema.js";
import { PROJECT_STATUS } from "../config/fleet.js";

describe("generateProjectId", () => {
  it("generates stable ID from repo_name + git_remote", () => {
    const id1 = generateProjectId("my-repo", "https://github.com/user/my-repo.git");
    const id2 = generateProjectId("my-repo", "https://github.com/user/my-repo.git");
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^my-repo__[a-f0-9]{8}$/);
  });

  it("generates different IDs for same name with different remotes", () => {
    const id1 = generateProjectId("my-repo", "https://github.com/user1/my-repo.git");
    const id2 = generateProjectId("my-repo", "https://github.com/user2/my-repo.git");
    expect(id1).not.toBe(id2);
  });

  it("generates ID without git remote", () => {
    const id = generateProjectId("my-repo");
    expect(id).toMatch(/^my-repo__[a-f0-9]{8}$/);
  });

  it("sanitizes repo names", () => {
    const id = generateProjectId("My Repo!@#$%", "https://example.com");
    expect(id).toMatch(/^my-repo__[a-f0-9]{8}$/);
  });
});

describe("ProjectRepo (DB operations)", () => {
  let ctx: TestDbContext;

  beforeAll(() => {
    ctx = createTestDb();
  });

  afterAll(() => {
    ctx.close();
  });

  beforeEach(() => {
    ctx.sqlite.exec("DELETE FROM briefings; DELETE FROM projects;");
  });

  it("inserts new project with timestamps", () => {
    const now = new Date().toISOString();
    const projectId = generateProjectId("test-repo", "https://github.com/test/repo");

    ctx.db.insert(schema.projects).values({
      projectId,
      repoName: "test-repo",
      repoRoot: "/path/to/repo",
      gitRemote: "https://github.com/test/repo",
      status: PROJECT_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    }).run();

    const result = ctx.db.select().from(schema.projects)
      .where(eq(schema.projects.projectId, projectId)).get();

    expect(result).toBeDefined();
    expect(result?.repoName).toBe("test-repo");
    expect(result?.status).toBe("active");
  });

  it("upserts existing project (updates timestamps)", async () => {
    const now = new Date().toISOString();
    const projectId = generateProjectId("test-repo");

    ctx.db.insert(schema.projects).values({
      projectId,
      repoName: "test-repo",
      repoRoot: "/old/path",
      status: PROJECT_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    }).run();

    await new Promise((r) => setTimeout(r, 10));
    const laterTime = new Date().toISOString();

    ctx.db.insert(schema.projects).values({
      projectId,
      repoName: "test-repo",
      repoRoot: "/new/path",
      status: PROJECT_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: laterTime,
    }).onConflictDoUpdate({
      target: schema.projects.projectId,
      set: { repoRoot: "/new/path", updatedAt: laterTime },
    }).run();

    const result = ctx.db.select().from(schema.projects)
      .where(eq(schema.projects.projectId, projectId)).get();

    expect(result?.repoRoot).toBe("/new/path");
    expect(result?.updatedAt).toBe(laterTime);
  });

  it("finds project by repoRoot path", () => {
    const now = new Date().toISOString();
    const projectId = generateProjectId("test-repo");
    const repoRoot = "/unique/path/to/repo";

    ctx.db.insert(schema.projects).values({
      projectId,
      repoName: "test-repo",
      repoRoot,
      status: PROJECT_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    }).run();

    const result = ctx.db.select().from(schema.projects)
      .where(eq(schema.projects.repoRoot, repoRoot)).get();

    expect(result?.projectId).toBe(projectId);
  });

  it("archives project (sets status)", () => {
    const now = new Date().toISOString();
    const projectId = generateProjectId("test-repo");

    ctx.db.insert(schema.projects).values({
      projectId,
      repoName: "test-repo",
      repoRoot: "/path",
      status: PROJECT_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    }).run();

    ctx.db.update(schema.projects)
      .set({ status: PROJECT_STATUS.ARCHIVED })
      .where(eq(schema.projects.projectId, projectId)).run();

    const result = ctx.db.select().from(schema.projects)
      .where(eq(schema.projects.projectId, projectId)).get();

    expect(result?.status).toBe("archived");
  });
});
