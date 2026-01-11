/**
 * Briefing ingestion service.
 * Handles transactional insertion of project + briefing + outbox event.
 */

import { getFleetDb, getFleetSqlite } from "./index.js";
import { ProjectRepo, generateProjectId } from "./project-repo.js";
import { BriefingRepo } from "./briefing-repo.js";
import { OutboxRepo } from "./outbox-repo.js";
import { parseStatusV5, tryParseStatusV5, type StatusV5 } from "./status-v5-parser.js";

export interface IngestionResult {
  success: boolean;
  projectId?: string;
  briefingId?: number;
  eventId?: number;
  error?: string;
  isDuplicate?: boolean;
}

export interface IngestionInput {
  /** Raw status file content */
  content: string;
  /** Override repo name (if not in frontmatter) */
  repoName?: string;
  /** Override repo root (if not in frontmatter) */
  repoRoot?: string;
  /** Override git remote (if not in frontmatter) */
  gitRemote?: string;
}

/**
 * Service for ingesting briefings from status.v5 files.
 * Provides transactional insert of project + briefing + outbox event.
 */
export class BriefingIngestor {
  private projectRepo: ProjectRepo;
  private briefingRepo: BriefingRepo;
  private outboxRepo: OutboxRepo;

  constructor() {
    this.projectRepo = new ProjectRepo();
    this.briefingRepo = new BriefingRepo();
    this.outboxRepo = new OutboxRepo();
  }

  /**
   * Ingest a status.v5 file content.
   * Performs transactional insert of project + briefing + outbox event.
   *
   * @param input - Ingestion input with content and optional overrides
   * @returns Ingestion result with IDs or error
   */
  ingest(input: IngestionInput): IngestionResult {
    const sqlite = getFleetSqlite();
    if (!sqlite) {
      // Ensure DB is initialized
      getFleetDb();
    }

    try {
      // Parse the status file
      const parsed = parseStatusV5(input.content);
      const fm = parsed.frontmatter;

      // Determine identity fields (frontmatter takes precedence)
      const repoName = fm.repo_name ?? input.repoName;
      const repoRoot = fm.repo_root ?? input.repoRoot;
      const gitRemote = fm.git_remote ?? input.gitRemote;

      if (!repoName || !repoRoot) {
        return {
          success: false,
          error: "Missing required fields: repo_name and repo_root",
        };
      }

      // Generate or use provided project ID
      const projectId = fm.project_id ?? generateProjectId(repoName, gitRemote);

      // Run in transaction
      const result = this.ingestTransactional({
        projectId,
        repoName,
        repoRoot,
        gitRemote,
        frontmatter: fm,
        markdown: parsed.markdown,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Try to ingest a file, returning null if it's not a valid v5 status file.
   */
  tryIngest(input: IngestionInput): IngestionResult | null {
    const parsed = tryParseStatusV5(input.content);
    if (!parsed) {
      return null;
    }

    return this.ingest(input);
  }

  /**
   * Internal transactional ingestion.
   */
  private ingestTransactional(params: {
    projectId: string;
    repoName: string;
    repoRoot: string;
    gitRemote?: string;
    frontmatter: StatusV5;
    markdown: string;
  }): IngestionResult {
    const sqlite = getFleetSqlite();
    if (!sqlite) {
      return {
        success: false,
        error: "Database not initialized",
      };
    }

    const { projectId, repoName, repoRoot, gitRemote, frontmatter, markdown } = params;

    // Use SQLite transaction for atomicity
    const transaction = sqlite.transaction(() => {
      // 1. Ensure project exists
      this.projectRepo.upsert({
        projectId,
        repoName,
        repoRoot,
        gitRemote,
        status: "active",
      });

      // 2. Insert briefing (idempotent)
      const briefingId = this.briefingRepo.insert({
        projectId,
        sessionId: frontmatter.session_id,
        taskId: frontmatter.task_id,
        status: frontmatter.status,
        startedAt: frontmatter.started_at,
        endedAt: frontmatter.ended_at,
        impactLevel: frontmatter.impact_level,
        broadcastLevel: frontmatter.broadcast_level,
        docDriftRisk: frontmatter.doc_drift_risk,
        baseCommit: frontmatter.base_commit,
        headCommit: frontmatter.head_commit,
        branch: frontmatter.branch,
        blockersJson: frontmatter.blockers ? JSON.stringify(frontmatter.blockers) : null,
        nextStepsJson: frontmatter.next_steps ? JSON.stringify(frontmatter.next_steps) : null,
        docsTouchedJson: frontmatter.docs_touched
          ? JSON.stringify(frontmatter.docs_touched)
          : null,
        filesTouchedJson: frontmatter.files_touched
          ? JSON.stringify(frontmatter.files_touched)
          : null,
        rawMarkdown: markdown,
      });

      // Check if this was a duplicate (no insert happened)
      if (briefingId === undefined) {
        return {
          success: true,
          projectId,
          isDuplicate: true,
        };
      }

      // 3. Insert outbox event
      const eventId = this.outboxRepo.insertBriefingAdded(briefingId, projectId, {
        briefing: {
          briefingId,
          projectId,
          status: frontmatter.status,
          impactLevel: frontmatter.impact_level,
          broadcastLevel: frontmatter.broadcast_level,
        },
      });

      return {
        success: true,
        projectId,
        briefingId,
        eventId,
      };
    });

    try {
      return transaction();
    } catch (error) {
      return {
        success: false,
        projectId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Ingest from a status file path.
   * Reads the file and ingests its content.
   */
  async ingestFromFile(
    filePath: string,
    overrides?: Omit<IngestionInput, "content">
  ): Promise<IngestionResult> {
    const fs = await import("node:fs/promises");

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return this.ingest({
        content,
        ...overrides,
      });
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Update semantic fields on an existing briefing.
   * Used after Sonnet finalization to add AI-generated fields.
   */
  updateSemanticFields(
    briefingId: number,
    fields: {
      impactLevel?: string;
      broadcastLevel?: string;
      docDriftRisk?: string;
      blockers?: string[];
      nextSteps?: string[];
      docsTouched?: string[];
      filesTouched?: string[];
    }
  ): void {
    this.briefingRepo.updateSemanticFields(briefingId, {
      impactLevel: fields.impactLevel,
      broadcastLevel: fields.broadcastLevel,
      docDriftRisk: fields.docDriftRisk,
      blockersJson: fields.blockers ? JSON.stringify(fields.blockers) : undefined,
      nextStepsJson: fields.nextSteps ? JSON.stringify(fields.nextSteps) : undefined,
      docsTouchedJson: fields.docsTouched ? JSON.stringify(fields.docsTouched) : undefined,
      filesTouchedJson: fields.filesTouched ? JSON.stringify(fields.filesTouched) : undefined,
    });
  }
}
