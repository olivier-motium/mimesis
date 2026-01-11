/**
 * Type definitions for API router
 *
 * Note: StreamServer and PtyManager are now optional as the gateway
 * replaces their functionality. Kept for backward compatibility during
 * transition to Fleet Commander v5.
 */

import type { KittyRc } from "../kitty-rc.js";
import type { TerminalLinkRepo } from "../db/terminal-link-repo.js";
import type { StreamServer } from "../server.js";
import type { SessionState } from "../watcher.js";
import type { PtyManager } from "../pty/index.js";
import type { TabManager } from "../tab-manager.js";

export interface RouterDependencies {
  kittyRc: KittyRc;
  linkRepo: TerminalLinkRepo;
  getSession: (id: string) => SessionState | undefined;
  getAllSessions?: () => Map<string, SessionState>;
  deleteSession?: (id: string) => boolean;
  tabManager?: TabManager;
  /** @deprecated Use gateway instead */
  streamServer?: StreamServer;
  /** @deprecated Use gateway instead */
  ptyManager?: PtyManager;
}
