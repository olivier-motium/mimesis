/**
 * Drizzle ORM schema for Fleet Commander SQLite database.
 * Stores projects, briefings, outbox events, and jobs.
 */

import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

/**
 * Projects table - repo identity
 * project_id format: {repo_name}__{8-char-hash}
 */
export const projects = sqliteTable("projects", {
  projectId: text("project_id").primaryKey(),
  repoName: text("repo_name").notNull(),
  repoRoot: text("repo_root").notNull(),
  gitRemote: text("git_remote"),
  status: text("status").default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Briefings table - durable history of session completions
 */
export const briefings = sqliteTable(
  "briefings",
  {
    briefingId: integer("briefing_id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.projectId),
    sessionId: text("session_id"),
    taskId: text("task_id"),
    status: text("status").notNull(), // completed|blocked|failed|waiting_for_input
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    impactLevel: text("impact_level"), // trivial|minor|moderate|major
    broadcastLevel: text("broadcast_level"), // silent|mention|highlight
    docDriftRisk: text("doc_drift_risk"), // low|medium|high
    baseCommit: text("base_commit"),
    headCommit: text("head_commit"),
    branch: text("branch"),
    blockersJson: text("blockers_json"), // JSON array
    nextStepsJson: text("next_steps_json"), // JSON array
    docsTouchedJson: text("docs_touched_json"), // JSON array
    filesTouchedJson: text("files_touched_json"), // JSON array
    rawMarkdown: text("raw_markdown").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique("briefing_unique_idx").on(
      table.projectId,
      table.sessionId,
      table.taskId,
      table.endedAt
    ),
  ]
);

/**
 * Outbox events table - push + replay queue
 * Used for delivering events to connected clients
 */
export const outboxEvents = sqliteTable("outbox_events", {
  eventId: integer("event_id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull(), // ISO timestamp
  type: text("type").notNull(), // briefing_added|skill_updated|job_completed|error
  projectId: text("project_id"),
  briefingId: integer("briefing_id"),
  payloadJson: text("payload_json").notNull(),
  delivered: integer("delivered", { mode: "boolean" }).default(false),
});

/**
 * Jobs table - headless job queue + Commander history
 */
export const jobs = sqliteTable("jobs", {
  jobId: integer("job_id").primaryKey({ autoIncrement: true }),
  tsCreated: text("ts_created").notNull(),
  tsStarted: text("ts_started"),
  tsFinished: text("ts_finished"),
  type: text("type").notNull(), // worker_task|skill_patch|doc_patch|commander_turn
  projectId: text("project_id"),
  repoRoot: text("repo_root"),
  model: text("model").notNull(), // opus|sonnet|haiku
  status: text("status").notNull(), // queued|running|completed|failed|canceled
  requestJson: text("request_json").notNull(),
  streamChunksJson: text("stream_chunks_json"), // Full stream output for replay
  resultJson: text("result_json"),
  error: text("error"),
});

// Type exports for use in repositories
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Briefing = typeof briefings.$inferSelect;
export type NewBriefing = typeof briefings.$inferInsert;

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
