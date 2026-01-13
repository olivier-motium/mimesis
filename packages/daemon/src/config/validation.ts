/**
 * Configuration validation - validates and creates required directories on startup.
 * Fails fast with clear error messages rather than silent runtime failures.
 */

import fs from "node:fs";
import path from "node:path";
import { DB_PATH, STREAM_DATA_DIR } from "./paths.js";
import { FLEET_BASE_DIR, FLEET_SESSIONS_DIR, FLEET_SCHEMAS_DIR } from "./fleet.js";

export interface ConfigError {
  field: string;
  message: string;
}

/**
 * Ensure a directory exists, creating it if necessary.
 * @returns Error message if creation fails, undefined if success
 */
function ensureDirectory(dirPath: string, fieldName: string): ConfigError | undefined {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    // Verify it's actually a directory
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { field: fieldName, message: `Path exists but is not a directory: ${dirPath}` };
    }
    // Verify we can write to it
    fs.accessSync(dirPath, fs.constants.W_OK);
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { field: fieldName, message: `Cannot create or access directory ${dirPath}: ${message}` };
  }
}

/**
 * Validate configuration and create required directories.
 * @returns Array of configuration errors (empty if valid)
 */
export function validateConfig(): ConfigError[] {
  const errors: ConfigError[] = [];

  // Ensure data directories exist
  const dbDir = path.dirname(DB_PATH);
  const dbError = ensureDirectory(dbDir, "DB_PATH");
  if (dbError) errors.push(dbError);

  const streamError = ensureDirectory(STREAM_DATA_DIR, "STREAM_DATA_DIR");
  if (streamError) errors.push(streamError);

  // Ensure Fleet Commander directories exist
  const fleetError = ensureDirectory(FLEET_BASE_DIR, "FLEET_BASE_DIR");
  if (fleetError) errors.push(fleetError);

  const sessionsError = ensureDirectory(FLEET_SESSIONS_DIR, "FLEET_SESSIONS_DIR");
  if (sessionsError) errors.push(sessionsError);

  const schemasError = ensureDirectory(FLEET_SCHEMAS_DIR, "FLEET_SCHEMAS_DIR");
  if (schemasError) errors.push(schemasError);

  return errors;
}

/**
 * Validate configuration or throw with detailed error message.
 * Call this early in startup to fail fast.
 */
export function validateConfigOrThrow(): void {
  const errors = validateConfig();
  if (errors.length > 0) {
    const messages = errors.map((e) => `  - ${e.field}: ${e.message}`).join("\n");
    throw new Error(`Configuration validation failed:\n${messages}`);
  }
}

/**
 * Log configuration summary for debugging.
 */
export function logConfigSummary(): void {
  console.log("[CONFIG] Data directories:");
  console.log(`  - DB_PATH: ${path.dirname(DB_PATH)}`);
  console.log(`  - STREAM_DATA_DIR: ${STREAM_DATA_DIR}`);
  console.log(`  - FLEET_BASE_DIR: ${FLEET_BASE_DIR}`);
}
