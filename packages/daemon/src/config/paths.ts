/**
 * File paths and API configuration.
 */

import path from "node:path";
import os from "node:os";
import { parsePositiveInt } from "./helpers.js";

// =============================================================================
// Database Configuration
// =============================================================================

/** Path to SQLite database */
export const DB_PATH = process.env.DB_PATH ??
  path.join(os.homedir(), ".mimesis", "data.db");

// =============================================================================
// File-Based Status Configuration
// =============================================================================

/** TTL for file-based status (5 minutes, same as IDLE_TIMEOUT_MS) */
export const STATUS_FILE_TTL_MS = 5 * 60 * 1000;

/** Filename for project status file */
export const STATUS_FILENAME = "status.md";

/** Directory containing status file */
export const STATUS_DIR = ".claude";

// =============================================================================
// Kitty Remote Control Configuration
// =============================================================================

/** Socket path for kitty remote control */
export const KITTY_SOCKET = process.env.KITTY_SOCKET ?? "unix:/tmp/claude-cc-kitty";

/** Environment variable name for kitty password */
export const KITTY_PASSWORD_ENV = "KITTY_RC_PASSWORD";

/** Timeout for kitty commands (5 seconds) */
export const KITTY_COMMAND_TIMEOUT_MS = 5_000;

// =============================================================================
// API Server Configuration
// =============================================================================

/** Port for the API server */
export const API_PORT = parsePositiveInt(process.env.API_PORT, 4451);

/** API endpoint prefix */
export const API_PREFIX = "/api";
