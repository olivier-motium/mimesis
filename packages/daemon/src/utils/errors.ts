/**
 * Standardized error handling utilities.
 * Provides consistent error message extraction and logging patterns.
 */

/**
 * Extract a human-readable error message from an unknown error.
 * Handles Error objects, strings, and other thrown values.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

/**
 * Log an error with consistent formatting.
 *
 * @param context - The component/operation context (e.g., "github", "summarizer")
 * @param error - The error to log
 * @param additionalInfo - Optional additional context to include
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: string
): void {
  const message = getErrorMessage(error);
  const prefix = `[${context}]`;
  const suffix = additionalInfo ? ` (${additionalInfo})` : "";
  console.error(`${prefix} ${message}${suffix}`);
}

/**
 * Log a warning with consistent formatting.
 *
 * @param context - The component/operation context
 * @param message - The warning message
 */
export function logWarn(context: string, message: string): void {
  console.warn(`[${context}] ${message}`);
}

/**
 * Log an info message with consistent formatting.
 *
 * @param context - The component/operation context
 * @param message - The info message
 */
export function logInfo(context: string, message: string): void {
  console.log(`[${context}] ${message}`);
}
