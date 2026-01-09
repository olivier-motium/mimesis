/**
 * Configuration helpers for parsing environment variables.
 */

/**
 * Parse an environment variable as a positive integer with validation.
 * Returns the default value if parsing fails or result is less than min.
 */
export function parsePositiveInt(value: string | undefined, defaultValue: number, min = 1): number {
  const parsed = parseInt(value ?? "", 10);
  if (isNaN(parsed) || parsed < min) {
    return defaultValue;
  }
  return parsed;
}
