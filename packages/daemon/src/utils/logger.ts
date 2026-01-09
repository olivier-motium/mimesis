/**
 * Simple logger utility with consistent prefix formatting.
 * Provides info, warn, error, and debug levels.
 */

export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
  debug: (msg: string) => void;
}

/**
 * Create a logger with a consistent prefix.
 * @param prefix - The prefix to prepend to all log messages (e.g., "PR", "KITTY", "API")
 */
export const createLogger = (prefix: string): Logger => ({
  info: (msg: string) => console.log(`[${prefix}] ${msg}`),
  warn: (msg: string) => console.warn(`[${prefix}] ${msg}`),
  error: (msg: string, err?: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err ?? "");
    console.error(`[${prefix}] ${msg}${err ? `: ${errMsg}` : ""}`);
  },
  debug: (msg: string) => {
    if (process.env.DEBUG) {
      console.log(`[${prefix}:DEBUG] ${msg}`);
    }
  },
});

/**
 * Log an error that was intentionally caught and suppressed.
 * Use this instead of empty catch blocks to provide debugging context.
 * @param context - Description of what operation failed
 * @param error - The error that was caught
 */
export const logSilentError = (context: string, error: unknown): void => {
  if (process.env.DEBUG) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(`[SILENT] ${context}: ${errMsg}`);
  }
};
