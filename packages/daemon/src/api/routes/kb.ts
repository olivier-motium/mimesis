/**
 * Knowledge Base API routes for Commander KB management.
 *
 * Routes:
 * - GET /kb/projects - List all KB projects with sync state
 * - GET /kb/projects/:projectId - Get KB project details
 * - GET /kb/projects/:projectId/summary - Get project summary
 * - GET /kb/projects/:projectId/activity - Get project activity
 * - POST /kb/sync - Trigger sync for all projects
 * - POST /kb/sync/:projectId - Trigger sync for specific project
 * - GET /kb/stats - Get KB statistics
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { KbSyncStateRepo } from "../../fleet-db/kb-sync-state-repo.js";
import { ProjectRepo } from "../../fleet-db/project-repo.js";
import { BriefingRepo } from "../../fleet-db/briefing-repo.js";
import {
  KNOWLEDGE_DIR,
  KNOWLEDGE_ALIASES_FILE,
  KB_STALE_DAYS,
  KB_BRIEFING_WINDOW_DAYS,
} from "../../config/fleet.js";
import { getErrorMessage } from "../../utils/errors.js";

/** Standard error response helper */
function errorResponse(c: Context, error: unknown, status: 400 | 404 | 500 = 500) {
  return c.json({ success: false, error: getErrorMessage(error) }, status);
}

/** Load aliases from aliases.json */
function loadAliases(): Record<string, string> {
  if (!fs.existsSync(KNOWLEDGE_ALIASES_FILE)) {
    return {};
  }

  try {
    const content = fs.readFileSync(KNOWLEDGE_ALIASES_FILE, "utf-8");
    const data = JSON.parse(content);
    // Remove _manual_overrides from result
    const { _manual_overrides, ...aliases } = data;
    return aliases;
  } catch {
    return {};
  }
}

/** List all KB project directories */
function listKbProjects(): string[] {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    return [];
  }

  return fs
    .readdirSync(KNOWLEDGE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes("__"))
    .map((entry) => entry.name);
}

/** Parse YAML frontmatter from markdown file */
function parseFrontmatter(content: string): Record<string, string> | null {
  if (!content.startsWith("---")) {
    return null;
  }

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) {
    return null;
  }

  const frontmatter = content.slice(3, endIdx).trim();
  const result: Record<string, string> = {};

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      result[key] = value;
    }
  }

  return result;
}

/** Read KB file content */
function readKbFile(projectId: string, filename: string): string | null {
  const filePath = path.join(KNOWLEDGE_DIR, projectId, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Check if KB is initialized */
function isKbInitialized(): boolean {
  return fs.existsSync(KNOWLEDGE_DIR) && fs.existsSync(KNOWLEDGE_ALIASES_FILE);
}

/** Calculate if sync is stale */
function isStale(lastSyncAt: string | null): boolean {
  if (!lastSyncAt) return true;

  try {
    const lastSync = new Date(lastSyncAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - KB_STALE_DAYS);
    return lastSync < cutoff;
  } catch {
    return true;
  }
}

// Request schemas
const SyncRequestSchema = z.object({
  full: z.boolean().optional().default(false),
});

/**
 * Create the KB API routes.
 */
export function createKbRoutes(): Hono {
  const kb = new Hono();

  // Initialize repositories
  const syncStateRepo = new KbSyncStateRepo();
  const projectRepo = new ProjectRepo();
  const briefingRepo = new BriefingRepo();

  /**
   * GET /kb/projects - List all KB projects with sync state
   */
  kb.get("/kb/projects", (c) => {
    try {
      if (!isKbInitialized()) {
        return c.json({
          success: true,
          initialized: false,
          projects: [],
          message: "Knowledge base not initialized. Run /knowledge-sync first.",
        });
      }

      const kbProjects = listKbProjects();
      const aliases = loadAliases();

      // Reverse aliases for lookup (projectId -> name)
      const reverseAliases: Record<string, string> = {};
      for (const [name, projectId] of Object.entries(aliases)) {
        reverseAliases[projectId] = name;
      }

      const projects = kbProjects.map((projectId) => {
        const syncState = syncStateRepo.getSyncState(projectId, "main");

        // Count 14-day briefings for this project
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - KB_BRIEFING_WINDOW_DAYS);
        const briefings = briefingRepo.query({
          projectId,
          limit: 1000,
        });
        const recentBriefings = briefings.filter(
          (b) => new Date(b.createdAt) >= cutoff
        );

        return {
          projectId,
          name: reverseAliases[projectId] ?? projectId.split("__")[0],
          lastSyncAt: syncState?.lastSyncAt ?? null,
          syncType: syncState?.syncType ?? null,
          lastCommitSeen: syncState?.lastCommitSeen ?? null,
          filesProcessed: syncState?.filesProcessed ?? 0,
          briefingCount: recentBriefings.length,
          isStale: isStale(syncState?.lastSyncAt ?? null),
          hasKb: true,
        };
      });

      // Also include projects from Fleet DB that don't have KB yet
      const fleetProjects = projectRepo.getActive();
      for (const project of fleetProjects) {
        if (!kbProjects.includes(project.projectId)) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - KB_BRIEFING_WINDOW_DAYS);
          const briefings = briefingRepo.query({
            projectId: project.projectId,
            limit: 1000,
          });
          const recentBriefings = briefings.filter(
            (b) => new Date(b.createdAt) >= cutoff
          );

          projects.push({
            projectId: project.projectId,
            name: project.repoName,
            lastSyncAt: null,
            syncType: null,
            lastCommitSeen: null,
            filesProcessed: 0,
            briefingCount: recentBriefings.length,
            isStale: true,
            hasKb: false,
          });
        }
      }

      // Sort by name
      projects.sort((a, b) => a.name.localeCompare(b.name));

      return c.json({
        success: true,
        initialized: true,
        projects,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /kb/projects/:projectId - Get KB project details
   */
  kb.get("/kb/projects/:projectId", (c) => {
    try {
      const projectId = c.req.param("projectId");
      const projectDir = path.join(KNOWLEDGE_DIR, projectId);

      if (!fs.existsSync(projectDir)) {
        return c.json(
          { success: false, error: "Project not found in knowledge base" },
          404
        );
      }

      const syncState = syncStateRepo.getSyncState(projectId, "main");
      const aliases = loadAliases();

      // Reverse aliases for lookup
      const reverseAliases: Record<string, string> = {};
      for (const [name, pid] of Object.entries(aliases)) {
        reverseAliases[pid] = name;
      }

      // Read file list
      const files = fs.readdirSync(projectDir).filter((f) => f.endsWith(".md"));

      // Count briefings
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - KB_BRIEFING_WINDOW_DAYS);
      const briefings = briefingRepo.query({ projectId, limit: 1000 });
      const recentBriefings = briefings.filter(
        (b) => new Date(b.createdAt) >= cutoff
      );

      return c.json({
        success: true,
        project: {
          projectId,
          name: reverseAliases[projectId] ?? projectId.split("__")[0],
          lastSyncAt: syncState?.lastSyncAt ?? null,
          syncType: syncState?.syncType ?? null,
          lastCommitSeen: syncState?.lastCommitSeen ?? null,
          filesProcessed: syncState?.filesProcessed ?? 0,
          briefingCount: recentBriefings.length,
          isStale: isStale(syncState?.lastSyncAt ?? null),
          files,
        },
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /kb/projects/:projectId/summary - Get project summary
   */
  kb.get("/kb/projects/:projectId/summary", (c) => {
    try {
      const projectId = c.req.param("projectId");
      const content = readKbFile(projectId, "summary.md");

      if (!content) {
        return c.json(
          { success: false, error: "Summary not found" },
          404
        );
      }

      const frontmatter = parseFrontmatter(content);

      // Extract content after frontmatter
      let body = content;
      if (content.startsWith("---")) {
        const endIdx = content.indexOf("---", 3);
        if (endIdx !== -1) {
          body = content.slice(endIdx + 3).trim();
        }
      }

      return c.json({
        success: true,
        summary: {
          projectId,
          frontmatter,
          content: body,
        },
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /kb/projects/:projectId/activity - Get project activity
   */
  kb.get("/kb/projects/:projectId/activity", (c) => {
    try {
      const projectId = c.req.param("projectId");
      const content = readKbFile(projectId, "activity.md");

      if (!content) {
        return c.json(
          { success: false, error: "Activity not found" },
          404
        );
      }

      const frontmatter = parseFrontmatter(content);

      // Extract content after frontmatter
      let body = content;
      if (content.startsWith("---")) {
        const endIdx = content.indexOf("---", 3);
        if (endIdx !== -1) {
          body = content.slice(endIdx + 3).trim();
        }
      }

      return c.json({
        success: true,
        activity: {
          projectId,
          frontmatter,
          content: body,
        },
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /kb/stats - Get KB statistics
   */
  kb.get("/kb/stats", (c) => {
    try {
      if (!isKbInitialized()) {
        return c.json({
          success: true,
          initialized: false,
          stats: {
            totalProjects: 0,
            staleProjects: 0,
            neverSynced: 0,
            totalBriefings: 0,
          },
        });
      }

      const kbProjects = listKbProjects();
      const allSyncStates = syncStateRepo.getAllSyncStates();
      const staleProjects = syncStateRepo.getStaleProjects(KB_STALE_DAYS);

      // Count projects that have never been synced
      const syncedProjectIds = new Set(allSyncStates.map((s) => s.projectId));
      const neverSynced = kbProjects.filter((p) => !syncedProjectIds.has(p)).length;

      // Count total 14-day briefings across all projects
      let totalBriefings = 0;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - KB_BRIEFING_WINDOW_DAYS);

      for (const projectId of kbProjects) {
        const briefings = briefingRepo.query({ projectId, limit: 1000 });
        totalBriefings += briefings.filter(
          (b) => new Date(b.createdAt) >= cutoff
        ).length;
      }

      return c.json({
        success: true,
        initialized: true,
        stats: {
          totalProjects: kbProjects.length,
          staleProjects: staleProjects.length,
          neverSynced,
          totalBriefings,
        },
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * POST /kb/sync - Trigger sync for all projects
   * Note: This is a placeholder - actual sync is triggered via /knowledge-sync command
   */
  kb.post("/kb/sync", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = SyncRequestSchema.safeParse(body);
      const full = parsed.success ? parsed.data.full : false;

      // Return instructions for now - actual sync requires Claude invocation
      return c.json({
        success: true,
        message: `Use the /knowledge-sync${full ? " --full" : ""} command in Commander to sync the knowledge base.`,
        hint: "KB sync requires Claude invocation for doc distillation.",
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * POST /kb/sync/:projectId - Trigger sync for specific project
   * Note: This is a placeholder - actual sync is triggered via /knowledge-sync command
   */
  kb.post("/kb/sync/:projectId", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      const body = await c.req.json().catch(() => ({}));
      const parsed = SyncRequestSchema.safeParse(body);
      const full = parsed.success ? parsed.data.full : false;

      // Return instructions for now - actual sync requires Claude invocation
      return c.json({
        success: true,
        message: `Use the /knowledge-sync ${projectId}${full ? " --full" : ""} command in Commander to sync this project.`,
        hint: "KB sync requires Claude invocation for doc distillation.",
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  return kb;
}
