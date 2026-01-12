/**
 * Fleet database connection singleton using better-sqlite3 and Drizzle ORM.
 * Database location: ~/.claude/commander/fleet.db
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { FLEET_DB_PATH, FLEET_BASE_DIR } from "../config/fleet.js";
import * as schema from "./schema.js";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;

/**
 * Initialize and get the Fleet database connection.
 * Creates the database file and tables on first call.
 */
export function getFleetDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    // Ensure ~/.claude/commander directory exists
    if (!fs.existsSync(FLEET_BASE_DIR)) {
      fs.mkdirSync(FLEET_BASE_DIR, { recursive: true });
    }

    sqlite = new Database(FLEET_DB_PATH);
    sqlite.pragma("journal_mode = WAL"); // Better concurrent access
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables if they don't exist
    sqlite.exec(`
      -- projects: repo identity
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        repo_name TEXT NOT NULL,
        repo_root TEXT NOT NULL,
        git_remote TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- briefings: durable history
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

      -- outbox_events: push + replay queue
      CREATE TABLE IF NOT EXISTS outbox_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        type TEXT NOT NULL,
        project_id TEXT,
        briefing_id INTEGER,
        payload_json TEXT NOT NULL,
        delivered INTEGER DEFAULT 0
      );

      -- jobs: headless job queue + Commander history
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

      -- conversations: stateful conversation sessions (Commander, etc.)
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        cwd TEXT NOT NULL,
        model TEXT NOT NULL,
        claude_session_id TEXT,
        last_outbox_event_id_seen INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_briefings_project ON briefings(project_id);
      CREATE INDEX IF NOT EXISTS idx_briefings_created ON briefings(created_at);
      CREATE INDEX IF NOT EXISTS idx_outbox_delivered ON outbox_events(delivered);
      CREATE INDEX IF NOT EXISTS idx_outbox_ts ON outbox_events(ts);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
      CREATE INDEX IF NOT EXISTS idx_conversations_kind ON conversations(kind);
    `);
  }
  return db;
}

/**
 * Close the Fleet database connection.
 * Call this on shutdown.
 */
export function closeFleetDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

/**
 * Get the raw SQLite instance for transactions.
 * Use with caution - prefer Drizzle ORM methods.
 */
export function getFleetSqlite(): Database.Database | null {
  return sqlite;
}

export { schema };
export { ConversationRepo, CONVERSATION_KIND } from "./conversation-repo.js";
export type { ConversationKind } from "./conversation-repo.js";
