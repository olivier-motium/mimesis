/**
 * Stream management endpoints for corruption recovery.
 *
 * @deprecated These endpoints are deprecated in Fleet Commander v5.
 * The gateway replaces the Durable Streams server.
 */

import { Hono } from "hono";
import type { RouterDependencies } from "../types.js";

/**
 * Create stream management routes.
 * Returns stubs when streamServer is not provided (v5 mode).
 */
export function createStreamRoutes(deps: RouterDependencies): Hono {
  const router = new Hono();

  // If no streamServer, return stubs for backward compatibility
  if (!deps.streamServer) {
    router.post("/stream/reset", (c) => {
      return c.json({
        success: false,
        error: "Stream server is deprecated. Use the gateway WebSocket instead.",
      }, 410); // 410 Gone
    });

    router.get("/stream/status", (c) => {
      return c.json({
        deprecated: true,
        message: "Stream server is deprecated. Use the gateway WebSocket instead.",
      });
    });

    return router;
  }

  /**
   * Reset stream data - clears corrupted stream and republishes all sessions.
   * Called by UI when it detects stream corruption (Symbol/liveQueryInternal errors).
   */
  router.post("/stream/reset", async (c) => {
    console.log("[STREAM] Reset requested by client");

    try {
      // Pause publishing during reset
      deps.streamServer!.pause();

      // Restart with data clearing
      await deps.streamServer!.restart(true);

      // Republish all cached sessions
      const cachedSessions = deps.streamServer!.getCachedSessions();
      let republished = 0;
      let failed = 0;

      for (const [, sessionState] of cachedSessions) {
        try {
          await deps.streamServer!.publishSession(sessionState, "insert");
          republished++;
        } catch (error) {
          failed++;
          console.error(`[STREAM] Failed to republish session ${sessionState.sessionId.slice(0, 8)}:`, error);
        }
      }

      // Resume publishing regardless of partial failures
      deps.streamServer!.resume();

      if (failed > 0) {
        console.error(`[STREAM] Reset partial failure: ${failed}/${cachedSessions.size} sessions failed to republish`);
        return c.json({ success: false, error: `${failed}/${cachedSessions.size} sessions failed to republish`, republished }, 500);
      }

      console.log(`[STREAM] Reset complete, republished ${republished} sessions`);
      return c.json({ success: true, republished });
    } catch (error) {
      console.error("[STREAM] Reset failed:", error);
      deps.streamServer!.resume(); // Ensure we resume even on failure
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
      paused: deps.streamServer!.isPaused(),
      url: deps.streamServer!.getStreamUrl(),
      cachedSessions: deps.streamServer!.getCachedSessions().size,
    });
  });

  return router;
}
