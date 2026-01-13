/**
 * Event waiting utilities for asynchronous testing.
 *
 * Provides utilities to wait for conditions, events, and async operations.
 */

/**
 * Wait for a condition to become true.
 *
 * @param condition - Function that returns true when condition is met
 * @param options - Timeout and polling interval options
 * @returns Promise that resolves when condition is true
 * @throws Error if timeout is reached
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50, message = "Condition not met" } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) return;
    await sleep(interval);
  }

  throw new Error(`Timeout after ${timeout}ms: ${message}`);
}

/**
 * Wait for a value to satisfy a condition.
 *
 * @param getValue - Function that returns the current value
 * @param predicate - Function that returns true when value is satisfactory
 * @param options - Timeout and polling interval options
 * @returns Promise that resolves with the satisfactory value
 */
export async function waitForValue<T>(
  getValue: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<T> {
  const { timeout = 5000, interval = 50, message = "Value condition not met" } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const value = await getValue();
    if (predicate(value)) return value;
    await sleep(interval);
  }

  throw new Error(`Timeout after ${timeout}ms: ${message}`);
}

/**
 * Wait for an async function to complete without throwing.
 *
 * @param fn - Async function to execute
 * @param options - Retry and timeout options
 * @returns Promise that resolves with the function result
 */
export async function waitForSuccess<T>(
  fn: () => Promise<T>,
  options: { timeout?: number; interval?: number; retries?: number } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100, retries = 10 } = options;
  const startTime = Date.now();
  let lastError: Error | null = null;
  let attempts = 0;

  while (Date.now() - startTime < timeout && attempts < retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempts++;
      await sleep(interval);
    }
  }

  throw new Error(
    `Failed after ${attempts} attempts and ${Date.now() - startTime}ms: ${lastError?.message}`
  );
}

/**
 * Wait for a specific duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise that can be resolved/rejected externally.
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Race a promise against a timeout.
 *
 * @param promise - Promise to race
 * @param timeoutMs - Timeout in milliseconds
 * @param message - Error message on timeout
 * @returns Promise that resolves with the result or rejects on timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string = "Operation timed out"
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms: ${message}`)), timeoutMs);
  });

  return Promise.race([promise, timeout]);
}

/**
 * Execute a function with a timeout.
 *
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param message - Error message on timeout
 * @returns Promise that resolves with the result or rejects on timeout
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message: string = "Operation timed out"
): Promise<T> {
  return withTimeout(fn(), timeoutMs, message);
}

/**
 * Wait for a port to become available.
 *
 * @param port - Port number to check
 * @param host - Host to check (default: 127.0.0.1)
 * @param options - Timeout options
 * @returns Promise that resolves when port is available
 */
export async function waitForPort(
  port: number,
  host: string = "127.0.0.1",
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 10000, interval = 100 } = options;
  const { Socket } = await import("node:net");

  await waitFor(
    () =>
      new Promise<boolean>((resolve) => {
        const socket = new Socket();
        socket.setTimeout(100);

        socket.on("connect", () => {
          socket.destroy();
          resolve(true);
        });

        socket.on("timeout", () => {
          socket.destroy();
          resolve(false);
        });

        socket.on("error", () => {
          socket.destroy();
          resolve(false);
        });

        socket.connect(port, host);
      }),
    { timeout, interval, message: `Port ${port} not available` }
  );
}

/**
 * Wait for a port to become unavailable (closed).
 *
 * @param port - Port number to check
 * @param host - Host to check (default: 127.0.0.1)
 * @param options - Timeout options
 * @returns Promise that resolves when port is closed
 */
export async function waitForPortClosed(
  port: number,
  host: string = "127.0.0.1",
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 10000, interval = 100 } = options;
  const { Socket } = await import("node:net");

  await waitFor(
    () =>
      new Promise<boolean>((resolve) => {
        const socket = new Socket();
        socket.setTimeout(100);

        socket.on("connect", () => {
          socket.destroy();
          resolve(false); // Port is still open
        });

        socket.on("timeout", () => {
          socket.destroy();
          resolve(true); // Port is closed
        });

        socket.on("error", () => {
          socket.destroy();
          resolve(true); // Port is closed
        });

        socket.connect(port, host);
      }),
    { timeout, interval, message: `Port ${port} still open` }
  );
}

/**
 * Create an event collector for testing event streams.
 */
export function createEventCollector<T>(): {
  events: T[];
  push: (event: T) => void;
  clear: () => void;
  waitForCount: (count: number, timeout?: number) => Promise<T[]>;
  waitForEvent: (predicate: (event: T) => boolean, timeout?: number) => Promise<T>;
} {
  const events: T[] = [];

  return {
    events,
    push: (event: T) => events.push(event),
    clear: () => (events.length = 0),
    waitForCount: async (count: number, timeout = 5000): Promise<T[]> => {
      await waitFor(() => events.length >= count, {
        timeout,
        message: `Expected ${count} events, got ${events.length}`,
      });
      return events.slice(0, count);
    },
    waitForEvent: async (predicate: (event: T) => boolean, timeout = 5000): Promise<T> => {
      const result = await waitForValue(
        () => events.find(predicate),
        (event): event is T => event !== undefined,
        { timeout, message: "Event not found" }
      );
      return result as T;
    },
  };
}

/**
 * Run a test with automatic cleanup.
 *
 * @param setup - Setup function that returns resources and cleanup function
 * @param test - Test function that receives the resources
 */
export async function withCleanup<T>(
  setup: () => Promise<{ resources: T; cleanup: () => Promise<void> | void }>,
  test: (resources: T) => Promise<void>
): Promise<void> {
  const { resources, cleanup } = await setup();
  try {
    await test(resources);
  } finally {
    await cleanup();
  }
}
