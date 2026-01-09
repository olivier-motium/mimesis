import { createStreamDB, type StreamDB } from "@durable-streams/state";
import { sessionsStateSchema } from "../types/schema";

/** Stream URL - configurable via VITE_STREAM_URL env var for remote deployments */
const STREAM_URL = import.meta.env.VITE_STREAM_URL ?? "http://127.0.0.1:4450/sessions";

/** API base URL for daemon endpoints */
const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4451/api/v1";

/** Maximum retries for initialization */
const MAX_RETRIES = 3;

/** Base delay between retries (multiplied by attempt number) */
const RETRY_DELAY_MS = 1000;

export type SessionsDB = StreamDB<typeof sessionsStateSchema>;

let dbInstance: SessionsDB | null = null;
let dbPromise: Promise<SessionsDB> | null = null;

/**
 * Check if an error indicates stream corruption (Symbol/utils undefined errors).
 */
function isCorruptionError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const stack = (error.stack ?? "").toLowerCase();
  return (
    message.includes("symbol") ||
    message.includes("utils is undefined") ||
    message.includes("livequeryinternal") ||
    stack.includes("symbol") ||
    stack.includes("livequeryinternal")
  );
}

/**
 * Request daemon to clear corrupted stream data and rebuild.
 * Returns true if successful, false otherwise.
 */
async function requestStreamReset(): Promise<boolean> {
  try {
    console.log("[StreamDB] Requesting stream reset from daemon...");
    const response = await fetch(`${API_BASE}/stream/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (response.ok) {
      const result = await response.json();
      console.log("[StreamDB] Stream reset successful, republished:", result.republished);
      return true;
    }
    console.error("[StreamDB] Stream reset failed:", response.status, await response.text());
    return false;
  } catch (error) {
    console.error("[StreamDB] Stream reset request failed:", error);
    return false;
  }
}

/**
 * Get or create the sessions StreamDB instance with retry logic and corruption recovery.
 * Call this in a route loader to ensure db is ready before render.
 */
export async function getSessionsDb(): Promise<SessionsDB> {
  // Return cached instance if available
  if (dbInstance) {
    return dbInstance;
  }

  // Return existing promise if initialization is in progress
  if (dbPromise) {
    return dbPromise;
  }

  // Create new initialization promise with retry logic
  dbPromise = initializeWithRetry();
  return dbPromise;
}

/**
 * Internal initialization with retry logic and corruption recovery.
 */
async function initializeWithRetry(): Promise<SessionsDB> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[StreamDB] Initialization attempt ${attempt}/${MAX_RETRIES}...`);

      const db = await createStreamDB({
        streamOptions: {
          url: STREAM_URL,
          contentType: "application/json",
        },
        state: sessionsStateSchema,
      });

      // Preload existing data
      await db.preload();

      // Success - cache and return
      dbInstance = db;
      console.log("[StreamDB] Connected successfully");
      return db;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[StreamDB] Init attempt ${attempt}/${MAX_RETRIES} failed:`,
        lastError.message
      );

      // Check for corruption error - request daemon to reset stream
      if (isCorruptionError(lastError)) {
        console.warn("[StreamDB] Detected possible corruption, requesting reset...");
        const resetSuccess = await requestStreamReset();
        if (resetSuccess) {
          // Wait a bit for daemon to rebuild before retrying
          await sleep(RETRY_DELAY_MS);
        }
      }

      // Wait before next attempt (exponential backoff)
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`[StreamDB] Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted - clear promise so future calls can retry
  dbPromise = null;
  throw new Error(
    `StreamDB initialization failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Reset the StreamDB connection (useful for manual recovery).
 * Closes existing connection and clears cached instances.
 */
export async function resetSessionsDb(): Promise<void> {
  console.log("[StreamDB] Resetting connection...");
  if (dbInstance) {
    try {
      await dbInstance.close();
    } catch (error) {
      console.warn("[StreamDB] Error closing existing connection:", error);
    }
  }
  dbInstance = null;
  dbPromise = null;
}

/**
 * Reset the singleton state without closing (for error recovery).
 * Use this when the connection failed to initialize.
 */
export function resetDbSingleton(): void {
  console.log("[StreamDB] Clearing singleton state for retry...");
  dbInstance = null;
  dbPromise = null;
}

/**
 * Get the db instance synchronously.
 * Only call this after getSessionsDb() has resolved (e.g., after loader).
 * Throws if db is not initialized.
 */
export function getSessionsDbSync(): SessionsDB {
  if (!dbInstance) {
    throw new Error("SessionsDB not initialized. Call getSessionsDb() first in a loader.");
  }
  return dbInstance;
}

/**
 * Close the sessions DB connection.
 */
export async function closeSessionsDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    dbPromise = null;
  }
}

/** Simple sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
