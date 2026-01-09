/**
 * Hook event endpoints - receives events from Claude Code hooks via emit-hook-event.py
 *
 * This endpoint processes hook events from Claude Code to maintain segment chains.
 * Hook events are emitted by the emit-hook-event.py bridge script which reads
 * hook JSON from stdin and attaches our stable COMMAND_CENTER_TAB_ID.
 *
 * Events handled:
 * - PreCompact: Mark current segment as ending (preparation)
 * - SessionStart (source=compact): Append new segment after compaction
 * - SessionStart (source=clear): Append new segment after /clear
 * - SessionStart (source=resume): Append new segment for --resume
 * - SessionStart (source=new): Append first segment for new session
 */

import { Hono } from "hono";
import type { RouterDependencies } from "../types.js";
import { HookEventPayloadSchema } from "../../schema.js";
import type { SegmentReason, CompactTrigger } from "../../schema.js";

/**
 * Create hooks route for receiving Claude Code hook events.
 */
export function createHooksRoutes(deps: RouterDependencies): Hono {
  const { tabManager } = deps;
  const router = new Hono();

  // Receive hook events from emit-hook-event.py
  router.post("/hooks", async (c) => {
    // TabManager is required for hooks
    if (!tabManager) {
      console.warn("[Hooks] TabManager not available, ignoring hook event");
      return c.json({ ok: true, ignored: true });
    }

    // Parse and validate payload
    const rawPayload = await c.req.json();
    const parseResult = HookEventPayloadSchema.safeParse(rawPayload);

    if (!parseResult.success) {
      console.warn("[Hooks] Invalid hook payload:", parseResult.error.issues);
      return c.json({ error: "Invalid payload", details: parseResult.error.issues }, 400);
    }

    const payload = parseResult.data;
    const {
      hook_event_name: eventName,
      session_id: sessionId,
      transcript_path: transcriptPath,
      source,
      trigger,
      command_center_tab_id: tabId,
      cwd,
    } = payload;

    console.log(
      `[Hooks] Received ${eventName} event: session=${sessionId?.slice(0, 8) ?? "none"}, ` +
        `tabId=${tabId?.slice(0, 8) ?? "none"}, source=${source ?? "none"}`
    );

    // Handle PreCompact - mark segment as ending
    if (eventName === "PreCompact") {
      if (!tabId || !sessionId) {
        console.warn("[Hooks] PreCompact missing tabId or sessionId");
        return c.json({ ok: true, skipped: "missing_ids" });
      }

      tabManager.markSegmentEnding(tabId, sessionId);
      return c.json({ ok: true, action: "segment_ending_marked" });
    }

    // Handle SessionStart - append new segment
    if (eventName === "SessionStart") {
      if (!tabId || !sessionId || !transcriptPath) {
        console.warn("[Hooks] SessionStart missing required fields");
        return c.json({ ok: true, skipped: "missing_fields" });
      }

      // Map source to segment reason
      const reasonMap: Record<string, SegmentReason> = {
        compact: "compact",
        clear: "clear",
        resume: "resume",
        new: "startup",
      };
      const reason: SegmentReason = reasonMap[source ?? "new"] ?? "startup";

      // Map trigger for compact events
      const triggerValue: CompactTrigger | undefined =
        reason === "compact" && trigger
          ? (trigger as CompactTrigger)
          : undefined;

      const segment = tabManager.appendSegment(tabId, {
        sessionId,
        transcriptPath,
        reason,
        trigger: triggerValue,
      });

      if (!segment) {
        console.warn(`[Hooks] Failed to append segment - tab ${tabId} not found`);
        return c.json({ ok: true, skipped: "tab_not_found" });
      }

      return c.json({
        ok: true,
        action: "segment_appended",
        segment: {
          sessionId: segment.sessionId,
          reason: segment.reason,
        },
      });
    }

    // Unknown event - log but don't fail
    console.log(`[Hooks] Unhandled event: ${eventName}`);
    return c.json({ ok: true, unhandled: eventName });
  });

  // Get tab info by tab ID (for debugging/inspection)
  router.get("/tabs/:tabId", (c) => {
    if (!tabManager) {
      return c.json({ error: "TabManager not available" }, 501);
    }

    const tabId = c.req.param("tabId");
    const tab = tabManager.getTab(tabId);

    if (!tab) {
      return c.json({ error: "Tab not found" }, 404);
    }

    return c.json({ tab });
  });

  // List all tabs
  router.get("/tabs", (c) => {
    if (!tabManager) {
      return c.json({ error: "TabManager not available" }, 501);
    }

    const tabs = tabManager.getAllTabs();
    return c.json({ tabs, count: tabs.length });
  });

  // Create a new tab (called by UI when opening embedded terminal)
  router.post("/tabs", async (c) => {
    if (!tabManager) {
      return c.json({ error: "TabManager not available" }, 501);
    }

    const body = await c.req.json<{ repoRoot: string }>();

    if (!body.repoRoot) {
      return c.json({ error: "repoRoot is required" }, 400);
    }

    const tab = tabManager.createTab(body.repoRoot);

    return c.json({ tab }, 201);
  });

  // Delete a tab
  router.delete("/tabs/:tabId", (c) => {
    if (!tabManager) {
      return c.json({ error: "TabManager not available" }, 501);
    }

    const tabId = c.req.param("tabId");
    const deleted = tabManager.destroyTab(tabId);

    if (!deleted) {
      return c.json({ error: "Tab not found" }, 404);
    }

    return c.json({ success: true });
  });

  return router;
}
