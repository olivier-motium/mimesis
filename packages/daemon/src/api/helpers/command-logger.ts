/**
 * Command history logging
 */

import { getDb, schema } from "../../db/index.js";
import { getErrorMessage } from "../../utils/type-guards.js";

/**
 * Log command to history table (fire and forget).
 */
export function logCommand(
  sessionId: string,
  windowId: number | null,
  text: string,
  submitted: boolean
): void {
  try {
    const db = getDb();
    db.insert(schema.commandHistory)
      .values({
        sessionId,
        kittyWindowId: windowId ?? 0, // Use 0 for embedded PTY
        command: text,
        sentAt: new Date().toISOString(),
        submitted,
      })
      .run();
  } catch (error) {
    // Fire and forget - don't fail the request
    console.error("[API] Failed to log command:", getErrorMessage(error));
  }
}
