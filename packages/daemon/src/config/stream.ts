/**
 * Stream server configuration.
 */

import { parsePositiveInt } from "./helpers.js";

/** Host for the durable streams server */
export const STREAM_HOST = process.env.STREAM_HOST ?? "127.0.0.1";

/** Port for the durable streams server (MIMESIS_PORT preferred, PORT for backwards compat) */
export const STREAM_PORT = parsePositiveInt(
  process.env.MIMESIS_PORT ?? process.env.PORT,
  4450
);

/** Path for the sessions stream endpoint */
export const STREAM_PATH = "/sessions";

/** Construct the full stream URL */
export function getStreamUrl(host = STREAM_HOST, port = STREAM_PORT): string {
  return `http://${host}:${port}${STREAM_PATH}`;
}
