/**
 * Database connection singleton using better-sqlite3 and Drizzle ORM.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { DB_PATH } from "../config.js";
import * as schema from "./schema.js";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;

/**
 * Initialize and get the database connection.
 * Creates the database file and runs migrations on first call.
 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    // Ensure directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL"); // Better concurrent access
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables if they don't exist (simple schema sync)
    // For production, use drizzle-kit migrations
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS terminal_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        kitty_window_id INTEGER NOT NULL,
        linked_at TEXT NOT NULL,
        stale INTEGER NOT NULL DEFAULT 0,
        repo_path TEXT,
        created_via TEXT
      );

      CREATE TABLE IF NOT EXISTS command_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        kitty_window_id INTEGER,
        command TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        submitted INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_preferences (
        session_id TEXT PRIMARY KEY,
        auto_focus_on_activity INTEGER,
        preferred_layout TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_links_session ON terminal_links(session_id);
      CREATE INDEX IF NOT EXISTS idx_command_history_session ON command_history(session_id);
      CREATE INDEX IF NOT EXISTS idx_command_history_sent ON command_history(sent_at);
    `);
  }
  return db;
}

/**
 * Close the database connection.
 * Call this on shutdown.
 */
export function closeDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

export { schema };
