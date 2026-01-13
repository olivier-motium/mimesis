/**
 * Fleet Commander configuration.
 * Database paths, gateway settings, and job limits.
 */

import path from "node:path";
import os from "node:os";

/** Base directory for Fleet Commander data */
export const FLEET_BASE_DIR = path.join(os.homedir(), ".claude", "commander");

/** Path to the Fleet database */
export const FLEET_DB_PATH = path.join(FLEET_BASE_DIR, "fleet.db");

/** Path to the gateway Unix socket for hook IPC */
export const FLEET_GATEWAY_SOCKET = path.join(FLEET_BASE_DIR, "gateway.sock");

/** Directory for session PID files (crash recovery) */
export const FLEET_SESSIONS_DIR = path.join(FLEET_BASE_DIR, "sessions");

/** Directory for JSON schemas (Sonnet output validation) */
export const FLEET_SCHEMAS_DIR = path.join(FLEET_BASE_DIR, "schemas");

/** Working directory for Commander conversation (used with --continue) */
export const COMMANDER_CWD = FLEET_BASE_DIR;

/** Gateway WebSocket port */
export const FLEET_GATEWAY_PORT = 4452;

/** Gateway WebSocket host (configurable via env for remote deployments) */
export const FLEET_GATEWAY_HOST = process.env.FLEET_GATEWAY_HOST ?? "127.0.0.1";

/** Get the full gateway WebSocket URL */
export function getFleetGatewayUrl(): string {
  return `ws://${FLEET_GATEWAY_HOST}:${FLEET_GATEWAY_PORT}`;
}

/** Ring buffer size per session (20MB) */
export const RING_BUFFER_SIZE_BYTES = 20 * 1024 * 1024;

/** Outbox polling interval (ms) */
export const OUTBOX_POLL_INTERVAL_MS = 1000;

/** Maximum concurrent headless jobs */
export const MAX_CONCURRENT_JOBS = 3;

/** Maximum concurrent jobs per project */
export const MAX_JOBS_PER_PROJECT = 1;

/** Job timeout (5 minutes) */
export const JOB_TIMEOUT_MS = 300_000;

/** Signal escalation delays for session termination */
export const SIGNAL_ESCALATION = {
  /** Wait after SIGINT before SIGTERM */
  SIGINT_TO_SIGTERM_MS: 3000,
  /** Wait after SIGTERM before SIGKILL */
  SIGTERM_TO_SIGKILL_MS: 5000,
} as const;

/** Status values for briefings */
export const BRIEFING_STATUS = {
  COMPLETED: "completed",
  BLOCKED: "blocked",
  FAILED: "failed",
  WAITING_FOR_INPUT: "waiting_for_input",
} as const;

/** Impact levels for briefings */
export const IMPACT_LEVEL = {
  TRIVIAL: "trivial",
  MINOR: "minor",
  MODERATE: "moderate",
  MAJOR: "major",
} as const;

/** Broadcast levels for briefings */
export const BROADCAST_LEVEL = {
  SILENT: "silent",
  MENTION: "mention",
  HIGHLIGHT: "highlight",
} as const;

/** Doc drift risk levels */
export const DOC_DRIFT_RISK = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

/** Job types */
export const JOB_TYPE = {
  WORKER_TASK: "worker_task",
  SKILL_PATCH: "skill_patch",
  DOC_PATCH: "doc_patch",
  COMMANDER_TURN: "commander_turn",
} as const;

/** Job status values */
export const JOB_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELED: "canceled",
} as const;

/** Model options for headless jobs */
export const MODEL = {
  OPUS: "opus",
  SONNET: "sonnet",
  HAIKU: "haiku",
} as const;

/** Outbox event types */
export const OUTBOX_EVENT_TYPE = {
  BRIEFING_ADDED: "briefing_added",
  SESSION_STARTED: "session_started",
  SESSION_BLOCKED: "session_blocked",
  DOC_DRIFT_WARNING: "doc_drift_warning",
  SKILL_UPDATED: "skill_updated",
  JOB_COMPLETED: "job_completed",
  ERROR: "error",
} as const;

/** Project status values */
export const PROJECT_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;
