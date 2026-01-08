/**
 * Hono API router for terminal control endpoints.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { KittyRc } from "../kitty-rc.js";
import {
  TerminalLinkRepo,
  type TerminalLink,
} from "../db/terminal-link-repo.js";
import { getDb, schema } from "../db/index.js";
import type { StreamServer } from "../server.js";
import type { SessionState } from "../watcher.js";
import { getKittyStatus, setupKitty } from "../kitty-setup.js";

interface RouterDependencies {
  kittyRc: KittyRc;
  linkRepo: TerminalLinkRepo;
  streamServer: StreamServer;
  getSession: (id: string) => SessionState | undefined;
  getAllSessions?: () => Map<string, SessionState>;
}

/**
 * Try to recover a terminal link when the stored window ID is invalid.
 * Searches by user_vars, then cmdline. Returns the valid window ID or null.
 */
async function tryRecoverLink(
  sessionId: string,
  link: TerminalLink,
  kittyRc: KittyRc,
  linkRepo: TerminalLinkRepo
): Promise<{ windowId: number; recovered: boolean } | null> {
  // First check if existing ID still works (fast path)
  const osWindows = await kittyRc.ls();
  if (kittyRc.windowExists(osWindows, link.kittyWindowId)) {
    return { windowId: link.kittyWindowId, recovered: false };
  }

  // Try to find by user_vars or cmdline
  const found = await kittyRc.findWindowByAny(sessionId);
  if (found) {
    linkRepo.updateWindowId(sessionId, found.windowId);
    console.log(
      `[API] Recovered link for ${sessionId.slice(0, 8)} via ${found.method}: ` +
      `${link.kittyWindowId} → ${found.windowId}`
    );
    return { windowId: found.windowId, recovered: true };
  }

  return null; // Window not found, needs new tab
}

/**
 * Create the API router with all terminal control endpoints.
 */
export function createApiRouter(deps: RouterDependencies) {
  const { kittyRc, linkRepo, streamServer, getSession } = deps;
  const api = new Hono();

  // Enable CORS for UI (allow any localhost port)
  api.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        try {
          const url = new URL(origin);
          if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
            return origin;  // Return the origin string to allow it
          }
          return null;  // Reject non-localhost origins
        } catch {
          return null;
        }
      },
      credentials: true,
    })
  );

  // Health check with detailed status
  api.get("/kitty/health", async (c) => {
    const details = await getKittyStatus();
    return c.json({
      available: details.socketReachable,
      details,
    });
  });

  // Debug: list all sessions known to the watcher
  api.get("/debug/sessions", (c) => {
    if (!deps.getAllSessions) {
      return c.json({
        message: "getAllSessions not available",
        hint: "Check daemon console logs for '[API] Session X not found'",
      });
    }

    const allSessions = deps.getAllSessions();
    const sessions = Array.from(allSessions.values()).map((s) => ({
      id: s.sessionId,
      status: s.status.status,
      cwd: s.cwd,
      lastActivityAt: s.status.lastActivityAt,
    }));

    return c.json({
      total: sessions.length,
      sessions: sessions.slice(0, 50), // Limit to 50 for readability
    });
  });

  // Manual setup trigger
  api.post("/kitty/setup", async (c) => {
    const result = await setupKitty();
    return c.json(result);
  });

  // Focus existing linked terminal (with recovery)
  api.post("/sessions/:id/focus", async (c) => {
    const sessionId = c.req.param("id");
    const link = linkRepo.get(sessionId);

    if (!link) {
      return c.json({ error: "No terminal linked" }, 404);
    }

    // Try recovery if window ID changed
    const result = await tryRecoverLink(sessionId, link, kittyRc, linkRepo);

    if (!result) {
      linkRepo.markStale(sessionId);
      await publishLinkUpdate(streamServer, sessionId, linkRepo.get(sessionId));
      return c.json({ error: "Terminal window not found", stale: true }, 410);
    }

    // If recovered, publish the updated link
    if (result.recovered) {
      await publishLinkUpdate(streamServer, sessionId, linkRepo.get(sessionId));
    }

    const success = await kittyRc.focusWindow(result.windowId);

    if (!success) {
      linkRepo.markStale(sessionId);
      await publishLinkUpdate(streamServer, sessionId, linkRepo.get(sessionId));
      return c.json({ error: "Focus failed" }, 500);
    }

    return c.json({ success: true, recovered: result.recovered });
  });

  // Focus or create terminal (with recovery)
  api.post("/sessions/:id/open", async (c) => {
    const sessionId = c.req.param("id");
    const allSessions = deps.getAllSessions?.();
    console.log(`[API] /open called for session ${sessionId.slice(0, 8)}, watcher has ${allSessions?.size ?? 0} sessions`);

    const session = getSession(sessionId);

    if (!session) {
      // Log available sessions to help diagnose why this session wasn't found
      const available = [...(allSessions?.keys() ?? [])].slice(0, 10).map(k => k.slice(0, 8)).join(', ');
      console.log(`[API] Session ${sessionId.slice(0, 8)} NOT FOUND. Available (first 10): ${available || 'none'}`);
      return c.json({ error: "Session not found" }, 404);
    }

    console.log(`[API] Session found: status=${session.status.status}, cwd=${session.cwd}`);

    // Try existing link with recovery
    const existingLink = linkRepo.get(sessionId);
    if (existingLink) {
      console.log(`[API] Trying existing link: windowId=${existingLink.kittyWindowId}, stale=${existingLink.stale}`);
      const result = await tryRecoverLink(sessionId, existingLink, kittyRc, linkRepo);

      if (result) {
        // Found or recovered - focus it
        if (result.recovered) {
          await publishLinkUpdate(streamServer, sessionId, linkRepo.get(sessionId));
        }
        const success = await kittyRc.focusWindow(result.windowId);
        if (success) {
          return c.json({
            success: true,
            windowId: result.windowId,
            recovered: result.recovered,
          });
        }
      }

      // Recovery failed or focus failed - will create new tab
      console.log(`[API] Recovery failed or window not found, will create new tab`);
    }

    // Create new tab with claude --resume to continue the session
    try {
      const dirName = session.cwd.split("/").pop() || session.cwd;
      console.log(`[API] Launching new tab for ${dirName}`);
      const windowId = await kittyRc.launchTab({
        cwd: session.cwd,
        tabTitle: `${dirName} • ${sessionId.slice(0, 8)}`,
        vars: { cc_session_id: sessionId },
        command: ["claude", "--resume", sessionId, "--dangerously-skip-permissions"],
      });

      console.log(`[API] Tab launched: windowId=${windowId}`);

      const link: TerminalLink = {
        sessionId,
        kittyWindowId: windowId,
        linkedAt: new Date().toISOString(),
        stale: false,
        repoPath: session.cwd,
        createdVia: "auto_open",
      };
      linkRepo.upsert(link);
      await publishLinkUpdate(streamServer, sessionId, link);

      // Focus the new window
      await kittyRc.focusWindow(windowId);

      return c.json({ success: true, windowId, created: true });
    } catch (err) {
      console.error(`[API] Failed to launch tab:`, err);
      const message = err instanceof Error ? err.message : "Failed to launch terminal";
      return c.json({ error: message }, 500);
    }
  });

  // Link existing terminal via interactive select
  api.post("/sessions/:id/link-terminal", async (c) => {
    const sessionId = c.req.param("id");
    const session = getSession(sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const windowId = await kittyRc.selectWindow();

    if (windowId === null) {
      return c.json({ error: "Selection cancelled" }, 400);
    }

    const link: TerminalLink = {
      sessionId,
      kittyWindowId: windowId,
      linkedAt: new Date().toISOString(),
      stale: false,
      repoPath: session.cwd,
      createdVia: "manual_link",
    };
    linkRepo.upsert(link);
    await publishLinkUpdate(streamServer, sessionId, link);

    return c.json({ success: true, windowId });
  });

  // Unlink terminal
  api.delete("/sessions/:id/link-terminal", async (c) => {
    const sessionId = c.req.param("id");
    linkRepo.delete(sessionId);
    await publishLinkUpdate(streamServer, sessionId, null);
    return c.json({ success: true });
  });

  // Send text to terminal (with recovery)
  api.post("/sessions/:id/send-text", async (c) => {
    const sessionId = c.req.param("id");
    const body = await c.req.json<{ text: string; submit: boolean }>();

    const link = linkRepo.get(sessionId);
    if (!link) {
      return c.json({ error: "No terminal linked" }, 404);
    }

    // Try recovery (handles stale links too)
    const result = await tryRecoverLink(sessionId, link, kittyRc, linkRepo);

    if (!result) {
      linkRepo.markStale(sessionId);
      await publishLinkUpdate(streamServer, sessionId, linkRepo.get(sessionId));
      return c.json({ error: "Terminal window not found", stale: true }, 410);
    }

    // If recovered, publish the updated link
    if (result.recovered) {
      await publishLinkUpdate(streamServer, sessionId, linkRepo.get(sessionId));
    }

    await kittyRc.sendText(result.windowId, body.text, body.submit);

    // Log to command history (fire and forget)
    logCommand(sessionId, result.windowId, body.text, body.submit);

    return c.json({ success: true, recovered: result.recovered });
  });

  return api;
}

/**
 * Publish terminal link update to the stream.
 */
async function publishLinkUpdate(
  server: StreamServer,
  sessionId: string,
  link: TerminalLink | null | undefined
): Promise<void> {
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

/**
 * Log command to history table (fire and forget).
 */
function logCommand(
  sessionId: string,
  windowId: number,
  text: string,
  submitted: boolean
): void {
  try {
    const db = getDb();
    db.insert(schema.commandHistory)
      .values({
        sessionId,
        kittyWindowId: windowId,
        command: text,
        sentAt: new Date().toISOString(),
        submitted,
      })
      .run();
  } catch (err) {
    // Fire and forget - don't fail the request
    console.error("[API] Failed to log command:", err);
  }
}
