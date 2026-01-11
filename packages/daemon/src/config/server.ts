/**
 * Server startup and lifecycle configuration.
 * Contains timeouts and intervals for daemon startup, port checking, and shutdown.
 */

/** Socket timeout for port availability check (ms) */
export const PORT_CHECK_SOCKET_TIMEOUT_MS = 1000;

/** Health check timeout for detecting running daemons (ms) */
export const DAEMON_HEALTH_CHECK_TIMEOUT_MS = 2000;

/** Wait time for port to be released after process kill (ms) */
export const PORT_RELEASE_WAIT_MS = 500;

/** Debounce interval for session watcher (ms) */
export const WATCHER_DEBOUNCE_MS = 300;

/** Debounce interval for status file watcher (ms) */
export const STATUS_WATCHER_DEBOUNCE_MS = 100;

/** Maximum time to wait for graceful shutdown (ms) */
export const SHUTDOWN_TIMEOUT_MS = 5000;
