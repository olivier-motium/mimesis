/**
 * PTY (Embedded Terminal) configuration.
 */

import { parsePositiveInt } from "./helpers.js";

/** Host for the PTY WebSocket server */
export const PTY_WS_HOST = process.env.PTY_WS_HOST ?? "127.0.0.1";

/** Port for the PTY WebSocket server */
export const PTY_WS_PORT = parsePositiveInt(process.env.PTY_WS_PORT, 4452);

/** Time before an idle PTY is destroyed (30 minutes) */
export const PTY_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Default terminal columns */
export const PTY_DEFAULT_COLS = 120;

/** Default terminal rows */
export const PTY_DEFAULT_ROWS = 40;

/** Interval for PTY idle check (1 minute) */
export const PTY_IDLE_CHECK_INTERVAL_MS = 60 * 1000;

/** Construct the PTY WebSocket URL */
export function getPtyWsUrl(host = PTY_WS_HOST, port = PTY_WS_PORT): string {
  return `ws://${host}:${port}`;
}
