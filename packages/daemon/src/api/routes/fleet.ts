/**
 * Fleet API routes for briefing ingestion and queries.
 *
 * Routes:
 * - POST /fleet/ingest - Ingest a status.v5 file
 * - GET /fleet/projects - List all projects
 * - GET /fleet/projects/:projectId - Get a project
 * - GET /fleet/projects/:projectId/briefings - Get project briefings
 * - GET /fleet/briefings/recent - Get recent briefings
 * - GET /fleet/outbox - Get outbox events (cursor-based)
 * - GET /fleet/jobs - Get jobs
 * - GET /fleet/commander/history - Get Commander conversation history
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import { BriefingIngestor } from "../../fleet-db/briefing-ingestor.js";
import { ProjectRepo } from "../../fleet-db/project-repo.js";
import { BriefingRepo } from "../../fleet-db/briefing-repo.js";
import { OutboxRepo } from "../../fleet-db/outbox-repo.js";
import { JobRepo } from "../../fleet-db/job-repo.js";
import { getErrorMessage } from "../../utils/errors.js";

/** Standard error response helper */
function errorResponse(c: Context, error: unknown, status: 400 | 500 = 500) {
  return c.json({ success: false, error: getErrorMessage(error) }, status);
}

// Request schemas
const IngestRequestSchema = z.object({
  content: z.string(),
  repoName: z.string().optional(),
  repoRoot: z.string().optional(),
  gitRemote: z.string().optional(),
});

const OutboxQuerySchema = z.object({
  cursor: z.coerce.number().default(0),
  limit: z.coerce.number().default(100),
});

const BriefingQuerySchema = z.object({
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  status: z.string().optional(),
  impactLevel: z.string().optional(),
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

const JobQuerySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  projectId: z.string().optional(),
  model: z.string().optional(),
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

const SessionStartRequestSchema = z.object({
  sessionId: z.string(),
  projectId: z.string(),
  repoName: z.string(),
  repoRoot: z.string(),
  gitRemote: z.string().nullish(),
  branch: z.string().nullish(),
});

/**
 * Convert Hono queries (Record<string, string[]>) to simple object for Zod.
 * Takes the first value of each array.
 */
function queriesToObject(queries: Record<string, string[]>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, values] of Object.entries(queries)) {
    if (values.length > 0) {
      result[key] = values[0];
    }
  }
  return result;
}

/**
 * Create the Fleet API routes.
 */
export function createFleetRoutes(): Hono {
  const fleet = new Hono();

  // Initialize repositories
  const ingestor = new BriefingIngestor();
  const projectRepo = new ProjectRepo();
  const briefingRepo = new BriefingRepo();
  const outboxRepo = new OutboxRepo();
  const jobRepo = new JobRepo();

  /**
   * POST /fleet/ingest - Ingest a status.v5 file
   */
  fleet.post("/fleet/ingest", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = IngestRequestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          { success: false, error: `Invalid request: ${parsed.error.message}` },
          400
        );
      }

      const result = ingestor.ingest(parsed.data);

      if (!result.success) {
        return c.json(result, 400);
      }

      return c.json(result, result.isDuplicate ? 200 : 201);
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * POST /fleet/session-start - Ingest a session start event
   * Used by SessionStart hook for roster awareness.
   * Creates a session_started outbox event with broadcast_level: silent.
   */
  fleet.post("/fleet/session-start", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = SessionStartRequestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          { success: false, error: `Invalid request: ${parsed.error.message}` },
          400
        );
      }

      const { sessionId, projectId, repoName, repoRoot, gitRemote, branch } = parsed.data;

      // 1. Ensure project exists
      projectRepo.upsert({
        projectId,
        repoName,
        repoRoot,
        gitRemote: gitRemote ?? undefined,
        status: "active",
      });

      // 2. Insert session_started outbox event (broadcast_level: silent)
      const eventId = outboxRepo.insertSessionStarted(sessionId, projectId, {
        session: {
          sessionId,
          projectId,
          repoName,
          branch: branch ?? undefined,
        },
      });

      return c.json({ success: true, projectId, eventId }, 201);
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/projects - List all projects
   */
  fleet.get("/fleet/projects", (c) => {
    try {
      const activeOnly = c.req.query("active") === "true";
      const projects = activeOnly ? projectRepo.getActive() : projectRepo.getAll();
      return c.json({ success: true, projects });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/projects/:projectId - Get a project
   */
  fleet.get("/fleet/projects/:projectId", (c) => {
    try {
      const projectId = c.req.param("projectId");
      const project = projectRepo.get(projectId);

      if (!project) {
        return c.json({ success: false, error: "Project not found" }, 404);
      }

      return c.json({ success: true, project });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/projects/:projectId/briefings - Get project briefings
   */
  fleet.get("/fleet/projects/:projectId/briefings", (c) => {
    try {
      const projectId = c.req.param("projectId");
      const limit = parseInt(c.req.query("limit") ?? "50", 10);
      const briefings = briefingRepo.getByProject(projectId, limit);
      return c.json({ success: true, briefings });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/briefings - Query briefings
   */
  fleet.get("/fleet/briefings", (c) => {
    try {
      const query = BriefingQuerySchema.parse(queriesToObject(c.req.queries()));
      const briefings = briefingRepo.query(query);
      return c.json({ success: true, briefings });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/briefings/recent - Get recent briefings
   */
  fleet.get("/fleet/briefings/recent", (c) => {
    try {
      const limit = parseInt(c.req.query("limit") ?? "20", 10);
      const briefings = briefingRepo.getRecent(limit);
      return c.json({ success: true, briefings });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/briefings/:briefingId - Get a briefing
   */
  fleet.get("/fleet/briefings/:briefingId", (c) => {
    try {
      const briefingId = parseInt(c.req.param("briefingId"), 10);
      const briefing = briefingRepo.get(briefingId);

      if (!briefing) {
        return c.json({ success: false, error: "Briefing not found" }, 404);
      }

      return c.json({ success: true, briefing });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/outbox - Get outbox events (cursor-based)
   */
  fleet.get("/fleet/outbox", (c) => {
    try {
      const query = OutboxQuerySchema.parse(queriesToObject(c.req.queries()));
      const events = outboxRepo.getAfterCursor(query.cursor, query.limit);
      const latestEventId = outboxRepo.getLatestEventId();

      return c.json({
        success: true,
        events,
        latestEventId,
        hasMore: events.length === query.limit,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/jobs - Query jobs
   */
  fleet.get("/fleet/jobs", (c) => {
    try {
      const query = JobQuerySchema.parse(queriesToObject(c.req.queries()));
      const jobs = jobRepo.query(query);
      return c.json({ success: true, jobs });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/jobs/:jobId - Get a job
   */
  fleet.get("/fleet/jobs/:jobId", (c) => {
    try {
      const jobId = parseInt(c.req.param("jobId"), 10);
      const job = jobRepo.get(jobId);

      if (!job) {
        return c.json({ success: false, error: "Job not found" }, 404);
      }

      return c.json({ success: true, job });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/commander/history - Get Commander conversation history
   */
  fleet.get("/fleet/commander/history", (c) => {
    try {
      const limit = parseInt(c.req.query("limit") ?? "100", 10);
      const jobs = jobRepo.getCommanderHistory(limit);
      return c.json({ success: true, jobs });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  /**
   * GET /fleet/stats - Get fleet statistics
   */
  fleet.get("/fleet/stats", (c) => {
    try {
      const projects = projectRepo.getAll();
      const activeProjects = projectRepo.getActive();
      const undeliveredEvents = outboxRepo.countUndelivered();
      const runningJobs = jobRepo.countRunning();

      return c.json({
        success: true,
        stats: {
          totalProjects: projects.length,
          activeProjects: activeProjects.length,
          undeliveredEvents,
          runningJobs,
        },
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  return fleet;
}
