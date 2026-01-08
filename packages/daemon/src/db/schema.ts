/**
 * Drizzle ORM schema for SQLite database.
 * Stores terminal links, command history, and session preferences.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Terminal links - maps sessions to kitty windows
 */
export const terminalLinks = sqliteTable("terminal_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().unique(),
  kittyWindowId: integer("kitty_window_id").notNull(),
  linkedAt: text("linked_at").notNull(), // ISO timestamp
  stale: integer("stale", { mode: "boolean" }).notNull().default(false),

  // Extensibility: store context for future features
  repoPath: text("repo_path"),
  createdVia: text("created_via"), // 'manual_link' | 'auto_open'
});

/**
 * Command history - for future features
 */
export const commandHistory = sqliteTable("command_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  kittyWindowId: integer("kitty_window_id"),
  command: text("command").notNull(),
  sentAt: text("sent_at").notNull(),
  submitted: integer("submitted", { mode: "boolean" }).notNull(),
});

/**
 * Session preferences - for future features
 */
export const sessionPreferences = sqliteTable("session_preferences", {
  sessionId: text("session_id").primaryKey(),
  autoFocusOnActivity: integer("auto_focus_on_activity", { mode: "boolean" }),
  preferredLayout: text("preferred_layout"), // 'tab' | 'split' | 'window'
  updatedAt: text("updated_at").notNull(),
});
