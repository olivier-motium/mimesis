/**
 * PTY API routes for embedded terminal management.
 *
 * Endpoints:
 * - POST /sessions/:id/pty - Create PTY for a session
 * - GET /sessions/:id/pty - Get existing PTY info
 * - DELETE /sessions/:id/pty - Destroy PTY
 * - POST /sessions/:id/pty/resize - Resize PTY
 */

import { Hono } from "hono";
import type { RouterDependencies } from "../types.js";

/**
 * Create PTY-related routes.
 */
export function createPtyRoutes(deps: RouterDependencies): Hono {
  const { ptyManager, getSession } = deps;
  const router = new Hono();

  // Guard: PTY manager must be available
  router.use("/sessions/:id/pty*", async (c, next) => {
    if (!ptyManager) {
      return c.json({ error: "PTY support not enabled" }, 503);
    }
    await next();
  });

  /**
   * POST /sessions/:id/pty - Create PTY for session
   */
  router.post("/sessions/:id/pty", async (c) => {
    const sessionId = c.req.param("id");

    // Validate session exists
    const session = getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Check if PTY already exists
    const existing = ptyManager!.getPtyInfoBySessionId(sessionId);
    if (existing) {
      return c.json(existing);
    }

    // Parse optional resize from body
    let cols: number | undefined;
    let rows: number | undefined;
    try {
      const body = await c.req.json();
      if (typeof body.cols === "number") cols = body.cols;
      if (typeof body.rows === "number") rows = body.rows;
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Create PTY with claude --resume command
    try {
      const ptyInfo = await ptyManager!.createPty({
        sessionId,
        cwd: session.cwd,
        command: ["claude", "--resume", sessionId, "--dangerously-skip-permissions"],
        cols,
        rows,
      });

      return c.json(ptyInfo);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create PTY";
      console.error("[PTY API] Create error:", message);
      return c.json({ error: message }, 500);
    }
  });

  /**
   * GET /sessions/:id/pty - Get PTY info
   */
  router.get("/sessions/:id/pty", async (c) => {
    const sessionId = c.req.param("id");

    const ptyInfo = ptyManager!.getPtyInfoBySessionId(sessionId);
    if (!ptyInfo) {
      return c.json({ error: "No PTY session found" }, 404);
    }

    return c.json(ptyInfo);
  });

  /**
   * DELETE /sessions/:id/pty - Destroy PTY
   */
  router.delete("/sessions/:id/pty", async (c) => {
    const sessionId = c.req.param("id");

    const destroyed = ptyManager!.destroyPtyBySessionId(sessionId);
    if (!destroyed) {
      return c.json({ error: "No PTY session found" }, 404);
    }

    return c.json({ success: true });
  });

  /**
   * POST /sessions/:id/pty/resize - Resize PTY
   */
  router.post("/sessions/:id/pty/resize", async (c) => {
    const sessionId = c.req.param("id");

    const ptySession = ptyManager!.getPtyBySessionId(sessionId);
    if (!ptySession) {
      return c.json({ error: "No PTY session found" }, 404);
    }

    let cols: number;
    let rows: number;
    try {
      const body = await c.req.json();
      if (typeof body.cols !== "number" || typeof body.rows !== "number") {
        return c.json({ error: "cols and rows are required" }, 400);
      }
      cols = body.cols;
      rows = body.rows;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const resized = ptyManager!.resizePty(ptySession.id, { cols, rows });
    if (!resized) {
      return c.json({ error: "Failed to resize PTY" }, 500);
    }

    return c.json({ success: true, cols, rows });
  });

  return router;
}
