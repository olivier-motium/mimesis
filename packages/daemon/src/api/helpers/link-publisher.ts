/**
 * Terminal link stream publishing
 *
 * @deprecated Stream server is deprecated in Fleet Commander v5.
 * Terminal links are now managed by the gateway.
 */

import type { StreamServer } from "../../server.js";
import type { TerminalLink } from "../../db/terminal-link-repo.js";

/**
 * Publish terminal link update to the stream.
 * No-op if server is not provided (v5 mode).
 */
export async function publishLinkUpdate(
  server: StreamServer | undefined,
  sessionId: string,
  link: TerminalLink | null | undefined
): Promise<void> {
  // In v5 mode, stream server is not used
  if (!server) {
    return;
  }

  // Convert to schema format and publish
  const terminalLink = link
    ? {
        kittyWindowId: link.kittyWindowId,
        linkedAt: link.linkedAt,
        stale: link.stale,
      }
    : null;

  await server.publishTerminalLinkUpdate(sessionId, terminalLink);
}
