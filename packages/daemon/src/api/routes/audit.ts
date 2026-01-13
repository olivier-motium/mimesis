/**
 * Audit API routes for Commander KB audit management.
 *
 * Routes:
 * - GET /audit/:projectId - List recent audits for project
 * - GET /audit/:projectId/:auditId - Get specific audit content
 * - POST /audit/:projectId/save - Save audit result (called by /audit skill)
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  getRecentAudits,
  getAuditById,
  saveAuditResult,
  countAudits,
  type AuditMetadata,
} from "../../knowledge/audit-storage.js";
import { OutboxRepo } from "../../fleet-db/outbox-repo.js";
import { getErrorMessage } from "../../utils/errors.js";

/** Standard error response helper */
function errorResponse(c: Context, error: unknown, status: 400 | 404 | 500 = 500) {
  return c.json({ success: false, error: getErrorMessage(error) }, status);
}

/**
 * Project ID validation regex.
 * Valid format: <repoName>__<hash>
 */
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+__[a-f0-9]{8,}$/;

/**
 * Validate and sanitize project ID to prevent path traversal.
 */
function validateProjectId(projectId: string): string | null {
  if (
    projectId.includes("\0") ||
    projectId.includes("/") ||
    projectId.includes("\\") ||
    projectId.includes("..")
  ) {
    return null;
  }

  if (!PROJECT_ID_PATTERN.test(projectId)) {
    return null;
  }

  return projectId;
}

/**
 * Validate audit ID format.
 */
function validateAuditId(auditId: string): string | null {
  // Must be date--target format, no path traversal
  if (
    auditId.includes("\0") ||
    auditId.includes("/") ||
    auditId.includes("\\") ||
    auditId.includes("..")
  ) {
    return null;
  }

  // Basic format check: YYYY-MM-DD--<something>
  if (!/^\d{4}-\d{2}-\d{2}--[\w-]+$/.test(auditId)) {
    return null;
  }

  return auditId;
}

// Request schema for saving audit
const SaveAuditSchema = z.object({
  target: z.string().min(1),
  content: z.string().min(1),
  metadata: z.object({
    model: z.string().optional(),
    inputs: z.object({
      repoCommit: z.string().optional(),
      briefingsWindow: z.string().optional(),
    }).optional(),
    evidence: z.object({
      briefingIds: z.array(z.number()).optional(),
    }).optional(),
  }).optional(),
  topRecommendation: z.string().optional(),
  optionsCount: z.number().optional(),
});

/**
 * Create the Audit API routes.
 */
export function createAuditRoutes(): Hono {
  const audit = new Hono();
  const outboxRepo = new OutboxRepo();

  /**
   * GET /audit/:projectId - List recent audits for project
   */
  audit.get("/audit/:projectId", (c) => {
    try {
      const rawProjectId = c.req.param("projectId");
      const projectId = validateProjectId(rawProjectId);

      if (!projectId) {
        return c.json(
          { success: false, error: "Invalid project ID format" },
          400
        );
      }

      const limit = parseInt(c.req.query("limit") ?? "10", 10);
      const audits = getRecentAudits(projectId, Math.min(limit, 50));
      const total = countAudits(projectId);

      return c.json({
        success: true,
        projectId,
        audits,
        total,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /audit/:projectId/:auditId - Get specific audit content
   */
  audit.get("/audit/:projectId/:auditId", (c) => {
    try {
      const rawProjectId = c.req.param("projectId");
      const rawAuditId = c.req.param("auditId");

      const projectId = validateProjectId(rawProjectId);
      if (!projectId) {
        return c.json(
          { success: false, error: "Invalid project ID format" },
          400
        );
      }

      const auditId = validateAuditId(rawAuditId);
      if (!auditId) {
        return c.json(
          { success: false, error: "Invalid audit ID format" },
          400
        );
      }

      const auditDetail = getAuditById(projectId, auditId);

      if (!auditDetail) {
        return c.json(
          { success: false, error: "Audit not found" },
          404
        );
      }

      return c.json({
        success: true,
        audit: auditDetail,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * POST /audit/:projectId/save - Save audit result
   *
   * Called by the /audit skill at the end of execution to persist results.
   * Also emits audit_completed outbox event.
   */
  audit.post("/audit/:projectId/save", async (c) => {
    try {
      const rawProjectId = c.req.param("projectId");
      const projectId = validateProjectId(rawProjectId);

      if (!projectId) {
        return c.json(
          { success: false, error: "Invalid project ID format" },
          400
        );
      }

      const body = await c.req.json();
      const parsed = SaveAuditSchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          { success: false, error: "Invalid request body", details: parsed.error.flatten() },
          400
        );
      }

      const { target, content, metadata, topRecommendation, optionsCount } = parsed.data;

      // Build metadata for storage
      const auditMetadata: Partial<Omit<AuditMetadata, "schema" | "projectId" | "target">> = {
        model: metadata?.model,
        inputs: metadata?.inputs,
        evidence: metadata?.evidence,
      };

      // Save to KB
      const { auditId, path } = saveAuditResult(projectId, target, content, auditMetadata);

      // Emit outbox event for Commander visibility
      outboxRepo.insertAuditCompleted(
        projectId,
        target,
        {
          topRecommendation: topRecommendation ?? "Audit completed",
          optionsCount: optionsCount ?? 0,
          artifactPath: path,
        },
        "mention"
      );

      return c.json({
        success: true,
        auditId,
        path,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  return audit;
}
