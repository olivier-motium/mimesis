/**
 * Stream management endpoints for corruption recovery.
 */

import { Hono } from "hono";
import type { RouterDependencies } from "../types.js";

/**
 * Create stream management routes.
 */
export function createStreamRoutes(deps: RouterDependencies): Hono {
  const router = new Hono();

  /**
   * Reset stream data - clears corrupted stream and republishes all sessions.
   * Called by UI when it detects stream corruption (Symbol/liveQueryInternal errors).
   */
  router.post("/stream/reset", async (c) => {
    console.log("[STREAM] Reset requested by client");

    try {
      // Pause publishing during reset
      deps.streamServer.pause();

      // Restart with data clearing
      await deps.streamServer.restart(true);

      // Republish all cached sessions
      const cachedSessions = deps.streamServer.getCachedSessions();
      let republished = 0;

      for (const [, sessionState] of cachedSessions) {
        try {
          await deps.streamServer.publishSession(sessionState, "insert");
          republished++;
        } catch (error) {
          console.error(`[STREAM] Failed to republish session ${sessionState.sessionId.slice(0, 8)}:`, error);
        }
      }

      console.log(`[STREAM] Reset complete, republished ${republished} sessions`);
      return c.json({ success: true, republished });
    } catch (error) {
      console.error("[STREAM] Reset failed:", error);
      deps.streamServer.resume(); // Ensure we resume even on failure
      return c.json(
        { error: error instanceof Error ? error.message : "Reset failed" },
        500
      );
    }
  });

  /**
   * Get stream status for health checks.
   */
  router.get("/stream/status", (c) => {
    return c.json({
      paused: deps.streamServer.isPaused(),
      url: deps.streamServer.getStreamUrl(),
      cachedSessions: deps.streamServer.getCachedSessions().size,
    });
  });

  return router;
}
