/**
 * Timeout utility for wrapping async operations with time limits.
 */

import { EXTERNAL_CALL_TIMEOUT_MS } from "../config/index.js";

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wrap a promise with a timeout.
 * Rejects with TimeoutError if the promise doesn't resolve within the specified time.
 *
 * @param promise - The promise to wrap
 * @param ms - Timeout in milliseconds (defaults to EXTERNAL_CALL_TIMEOUT_MS)
 * @param errorMessage - Custom error message for timeout
 * @returns The resolved value of the promise
 * @throws TimeoutError if the timeout is exceeded
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = EXTERNAL_CALL_TIMEOUT_MS,
  errorMessage = "Operation timed out"
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${errorMessage} after ${ms}ms`, ms));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Create a timeout-wrapped version of an async function.
 * Useful for wrapping existing async functions with consistent timeout behavior.
 *
 * @param fn - The async function to wrap
 * @param ms - Timeout in milliseconds
 * @param errorMessage - Custom error message for timeout
 * @returns A new function with the same signature but with timeout
 */
export function withTimeoutFn<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  ms: number = EXTERNAL_CALL_TIMEOUT_MS,
  errorMessage?: string
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) =>
    withTimeout(fn(...args), ms, errorMessage ?? `Function call timed out`);
}
