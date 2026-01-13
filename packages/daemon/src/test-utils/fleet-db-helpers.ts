/**
 * Fleet database test helpers.
 *
 * Provides isolated database instances and fixture generators for testing.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../fleet-db/schema.js";
import {
  BRIEFING_STATUS,
  IMPACT_LEVEL,
  BROADCAST_LEVEL,
  DOC_DRIFT_RISK,
  JOB_STATUS,
  JOB_TYPE,
  MODEL,
  PROJECT_STATUS,
} from "../config/fleet.js";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestDbContext {
  db: TestDb;
  sqlite: Database.Database;
  dbPath: string;
  tempDir: string;
  close: () => void;
}

/**
 * Create an isolated test database.
 * Returns a context with database, path, and cleanup function.
 */
export function createTestDb(): TestDbContext {
  const tempDir = mkdtempSync(join(tmpdir(), "fleet-test-"));
  const dbPath = join(tempDir, "fleet.db");

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      repo_name TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      git_remote TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS briefings (
      briefing_id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(project_id),
      session_id TEXT,
      task_id TEXT,
      status TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      impact_level TEXT,
      broadcast_level TEXT,
      doc_drift_risk TEXT,
      base_commit TEXT,
      head_commit TEXT,
      branch TEXT,
      blockers_json TEXT,
      next_steps_json TEXT,
      docs_touched_json TEXT,
      files_touched_json TEXT,
      raw_markdown TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(project_id, session_id, task_id, ended_at)
    );

    CREATE TABLE IF NOT EXISTS outbox_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      type TEXT NOT NULL,
      project_id TEXT,
      briefing_id INTEGER,
      broadcast_level TEXT,
      payload_json TEXT NOT NULL,
      delivered INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS jobs (
      job_id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts_created TEXT NOT NULL,
      ts_started TEXT,
      ts_finished TEXT,
      type TEXT NOT NULL,
      project_id TEXT,
      repo_root TEXT,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      request_json TEXT NOT NULL,
      stream_chunks_json TEXT,
      result_json TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_briefings_project ON briefings(project_id);
    CREATE INDEX IF NOT EXISTS idx_briefings_created ON briefings(created_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_delivered ON outbox_events(delivered);
    CREATE INDEX IF NOT EXISTS idx_outbox_ts ON outbox_events(ts);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
  `);

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    dbPath,
    tempDir,
    close: () => {
      sqlite.close();
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true });
      }
    },
  };
}

/**
 * Create a test project directory.
 */
export function createTestProjectDir(): { path: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), "fleet-project-"));
  return {
    path: tempDir,
    cleanup: () => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true });
      }
    },
  };
}

/**
 * Generate a unique project ID.
 */
export function generateProjectId(repoName: string = "test-repo"): string {
  const hash = Math.random().toString(36).substring(2, 10);
  return `${repoName}__${hash}`;
}

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  return `test-session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate a unique task ID.
 */
export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Fixture factory for creating test projects.
 */
export function createProjectFixture(overrides: Partial<schema.NewProject> = {}): schema.NewProject {
  const now = new Date().toISOString();
  return {
    projectId: generateProjectId(),
    repoName: "test-repo",
    repoRoot: "/tmp/test-repo",
    gitRemote: "https://github.com/test/repo.git",
    status: PROJECT_STATUS.ACTIVE,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Fixture factory for creating test briefings.
 */
export function createBriefingFixture(
  projectId: string,
  overrides: Partial<schema.NewBriefing> = {}
): schema.NewBriefing {
  const now = new Date().toISOString();
  return {
    projectId,
    sessionId: generateSessionId(),
    taskId: generateTaskId(),
    status: BRIEFING_STATUS.COMPLETED,
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    endedAt: now,
    impactLevel: IMPACT_LEVEL.MINOR,
    broadcastLevel: BROADCAST_LEVEL.MENTION,
    docDriftRisk: DOC_DRIFT_RISK.LOW,
    baseCommit: "abc1234",
    headCommit: "def5678",
    branch: "main",
    blockersJson: JSON.stringify([]),
    nextStepsJson: JSON.stringify(["Review code", "Merge PR"]),
    docsTouchedJson: JSON.stringify(["README.md"]),
    filesTouchedJson: JSON.stringify(["src/index.ts", "src/utils.ts"]),
    rawMarkdown: `## Summary\nTest briefing content`,
    createdAt: now,
    ...overrides,
  };
}

/**
 * Fixture factory for creating test outbox events.
 */
export function createOutboxEventFixture(
  type: string,
  overrides: Partial<schema.NewOutboxEvent> = {}
): schema.NewOutboxEvent {
  return {
    ts: new Date().toISOString(),
    type,
    projectId: null,
    briefingId: null,
    payloadJson: JSON.stringify({ test: true }),
    delivered: false,
    ...overrides,
  };
}

/**
 * Fixture factory for creating test jobs.
 */
export function createJobFixture(overrides: Partial<schema.NewJob> = {}): schema.NewJob {
  const now = new Date().toISOString();
  return {
    tsCreated: now,
    tsStarted: null,
    tsFinished: null,
    type: JOB_TYPE.COMMANDER_TURN,
    projectId: null,
    repoRoot: null,
    model: MODEL.SONNET,
    status: JOB_STATUS.QUEUED,
    requestJson: JSON.stringify({
      prompt: "Test prompt",
      systemPrompt: null,
      jsonSchema: null,
      maxTurns: 1,
      disallowedTools: [],
    }),
    streamChunksJson: null,
    resultJson: null,
    error: null,
    ...overrides,
  };
}

/**
 * Insert a project and return it.
 */
export async function insertProject(
  db: TestDb,
  overrides: Partial<schema.NewProject> = {}
): Promise<schema.Project> {
  const project = createProjectFixture(overrides);
  await db.insert(schema.projects).values(project);
  return project as schema.Project;
}

/**
 * Insert a briefing and return it with generated ID.
 */
export async function insertBriefing(
  db: TestDb,
  projectId: string,
  overrides: Partial<schema.NewBriefing> = {}
): Promise<schema.Briefing> {
  const briefing = createBriefingFixture(projectId, overrides);
  const result = await db.insert(schema.briefings).values(briefing).returning();
  return result[0];
}

/**
 * Insert an outbox event and return it with generated ID.
 */
export async function insertOutboxEvent(
  db: TestDb,
  type: string,
  overrides: Partial<schema.NewOutboxEvent> = {}
): Promise<schema.OutboxEvent> {
  const event = createOutboxEventFixture(type, overrides);
  const result = await db.insert(schema.outboxEvents).values(event).returning();
  return result[0];
}

/**
 * Insert a job and return it with generated ID.
 */
export async function insertJob(
  db: TestDb,
  overrides: Partial<schema.NewJob> = {}
): Promise<schema.Job> {
  const job = createJobFixture(overrides);
  const result = await db.insert(schema.jobs).values(job).returning();
  return result[0];
}

/**
 * Clear all tables in the test database.
 */
export function clearAllTables(sqlite: Database.Database): void {
  sqlite.exec(`
    DELETE FROM jobs;
    DELETE FROM outbox_events;
    DELETE FROM briefings;
    DELETE FROM projects;
  `);
}

/**
 * Get table row counts for verification.
 */
export function getTableCounts(sqlite: Database.Database): {
  projects: number;
  briefings: number;
  outboxEvents: number;
  jobs: number;
} {
  const counts = {
    projects: sqlite.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number },
    briefings: sqlite.prepare("SELECT COUNT(*) as count FROM briefings").get() as { count: number },
    outboxEvents: sqlite.prepare("SELECT COUNT(*) as count FROM outbox_events").get() as {
      count: number;
    },
    jobs: sqlite.prepare("SELECT COUNT(*) as count FROM jobs").get() as { count: number },
  };
  return {
    projects: counts.projects.count,
    briefings: counts.briefings.count,
    outboxEvents: counts.outboxEvents.count,
    jobs: counts.jobs.count,
  };
}
