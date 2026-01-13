/**
 * Audit storage utilities for Commander KB.
 *
 * Handles storing and retrieving first-principles audit results
 * within project knowledge directories.
 *
 * Directory structure:
 * ~/.claude/commander/knowledge/<project_id>/audits/
 *   2026-01-13--src-auth.md
 *   2026-01-13--retrieval-pipeline.md
 */

import fs from "node:fs";
import path from "node:path";
import { KNOWLEDGE_DIR, KNOWLEDGE_AUDITS_SUBDIR } from "../config/fleet.js";
import { ensureProjectKbDir } from "./ensure-kb-dir.js";

/**
 * Audit metadata schema (matches YAML frontmatter).
 */
export interface AuditMetadata {
  schema: "audit.v1";
  projectId: string;
  target: string;
  generatedAt: string;
  model: string;
  inputs?: {
    repoCommit?: string;
    briefingsWindow?: string;
  };
  evidence?: {
    briefingIds?: number[];
  };
}

/**
 * Audit summary for list views.
 */
export interface AuditSummary {
  id: string;
  target: string;
  generatedAt: string;
  filename: string;
  topRecommendation?: string;
}

/**
 * Full audit detail with content.
 */
export interface AuditDetail {
  id: string;
  target: string;
  metadata: AuditMetadata;
  content: string;
  filename: string;
}

/**
 * Get the audits directory for a project.
 */
export function getAuditsDir(projectId: string): string {
  return path.join(KNOWLEDGE_DIR, projectId, KNOWLEDGE_AUDITS_SUBDIR);
}

/**
 * Ensure the audits directory exists for a project.
 */
export function ensureAuditsDir(projectId: string): string {
  ensureProjectKbDir(projectId);
  const auditsDir = getAuditsDir(projectId);
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true, mode: 0o700 });
  }
  return auditsDir;
}

/**
 * Generate audit filename from target.
 * Format: YYYY-MM-DD--<sanitized-target>.md
 */
export function generateAuditFilename(target: string): string {
  const date = new Date().toISOString().split("T")[0];
  // Sanitize target: replace slashes and special chars with dashes
  const sanitized = target
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${date}--${sanitized}.md`;
}

/**
 * Generate audit ID from filename.
 * ID is filename without .md extension.
 */
export function filenameToId(filename: string): string {
  return filename.replace(/\.md$/, "");
}

/**
 * Parse YAML frontmatter from audit content.
 * Returns null if no valid frontmatter found.
 */
function parseFrontmatter(content: string): AuditMetadata | null {
  if (!content.startsWith("---")) {
    return null;
  }

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) {
    return null;
  }

  const frontmatter = content.slice(3, endIdx).trim();
  const result: Record<string, unknown> = {};
  let currentKey = "";
  let inNestedBlock = false;
  let nestedObj: Record<string, unknown> = {};

  for (const line of frontmatter.split("\n")) {
    // Check for nested block start (key with no value, followed by indented lines)
    if (!line.startsWith("  ") && line.includes(":")) {
      // Save previous nested block if any
      if (inNestedBlock && currentKey) {
        result[currentKey] = nestedObj;
        nestedObj = {};
        inNestedBlock = false;
      }

      const colonIdx = line.indexOf(":");
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      if (value) {
        result[key] = value;
        currentKey = "";
      } else {
        currentKey = key;
        inNestedBlock = true;
      }
    } else if (line.startsWith("  ") && inNestedBlock) {
      // Nested key-value
      const trimmed = line.trim();
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const nestedKey = trimmed.slice(0, colonIdx).trim();
        let nestedValue: unknown = trimmed.slice(colonIdx + 1).trim();

        // Handle arrays (e.g., [1234, 1240])
        if (
          typeof nestedValue === "string" &&
          nestedValue.startsWith("[") &&
          nestedValue.endsWith("]")
        ) {
          try {
            nestedValue = JSON.parse(nestedValue);
          } catch {
            // Keep as string if parse fails
          }
        }

        nestedObj[nestedKey] = nestedValue;
      }
    }
  }

  // Save final nested block
  if (inNestedBlock && currentKey) {
    result[currentKey] = nestedObj;
  }

  // Validate required fields
  if (result.schema !== "audit.v1" || !result.project_id || !result.target) {
    return null;
  }

  return {
    schema: "audit.v1",
    projectId: result.project_id as string,
    target: result.target as string,
    generatedAt: (result.generated_at as string) ?? new Date().toISOString(),
    model: (result.model as string) ?? "unknown",
    inputs: result.inputs as AuditMetadata["inputs"],
    evidence: result.evidence as AuditMetadata["evidence"],
  };
}

/**
 * Extract body content after frontmatter.
 */
function extractBody(content: string): string {
  if (!content.startsWith("---")) {
    return content;
  }

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) {
    return content;
  }

  return content.slice(endIdx + 3).trim();
}

/**
 * Extract top recommendation from audit content.
 * Looks for "## Executive summary" or first numbered bullet.
 */
function extractTopRecommendation(content: string): string | undefined {
  const body = extractBody(content);
  const lines = body.split("\n");

  // Look for executive summary section
  let inSummary = false;
  for (const line of lines) {
    if (line.toLowerCase().includes("executive summary")) {
      inSummary = true;
      continue;
    }

    if (inSummary) {
      // Look for first bullet point
      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        return bulletMatch[1].slice(0, 150); // Truncate for summary
      }

      // Stop at next section
      if (line.startsWith("##")) {
        break;
      }
    }
  }

  return undefined;
}

/**
 * Build YAML frontmatter string from metadata.
 */
function buildFrontmatter(metadata: AuditMetadata): string {
  const lines = [
    "---",
    `schema: ${metadata.schema}`,
    `project_id: ${metadata.projectId}`,
    `target: "${metadata.target}"`,
    `generated_at: ${metadata.generatedAt}`,
    `model: ${metadata.model}`,
  ];

  if (metadata.inputs) {
    lines.push("inputs:");
    if (metadata.inputs.repoCommit) {
      lines.push(`  repo_commit: ${metadata.inputs.repoCommit}`);
    }
    if (metadata.inputs.briefingsWindow) {
      lines.push(`  briefings_window: ${metadata.inputs.briefingsWindow}`);
    }
  }

  if (metadata.evidence) {
    lines.push("evidence:");
    if (metadata.evidence.briefingIds?.length) {
      lines.push(`  briefing_ids: ${JSON.stringify(metadata.evidence.briefingIds)}`);
    }
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Validate project ID format to prevent path traversal.
 * Valid format: <repoName>__<hash>
 */
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+__[a-f0-9]{8,}$/;

function validateProjectId(projectId: string): boolean {
  return (
    !projectId.includes("\0") &&
    !projectId.includes("/") &&
    !projectId.includes("\\") &&
    !projectId.includes("..") &&
    PROJECT_ID_PATTERN.test(projectId)
  );
}

/**
 * Save an audit result to the knowledge base.
 *
 * @param projectId - The project ID (e.g., "mimesis__607a7a7c")
 * @param target - The audit target (e.g., "src/gateway")
 * @param content - The audit content (markdown body, without frontmatter)
 * @param metadata - Partial metadata (schema, projectId, target auto-filled)
 * @returns Object with auditId and path
 * @throws Error if projectId is invalid
 */
export function saveAuditResult(
  projectId: string,
  target: string,
  content: string,
  metadata: Partial<Omit<AuditMetadata, "schema" | "projectId" | "target">> = {}
): { auditId: string; path: string } {
  if (!validateProjectId(projectId)) {
    throw new Error("Invalid project ID format");
  }

  const auditsDir = ensureAuditsDir(projectId);
  const filename = generateAuditFilename(target);
  const filePath = path.join(auditsDir, filename);

  // Build full metadata
  const fullMetadata: AuditMetadata = {
    schema: "audit.v1",
    projectId,
    target,
    generatedAt: metadata.generatedAt ?? new Date().toISOString(),
    model: metadata.model ?? "claude-opus-4-5-20251101",
    inputs: metadata.inputs,
    evidence: metadata.evidence,
  };

  // Combine frontmatter and content
  const frontmatter = buildFrontmatter(fullMetadata);
  const fullContent = `${frontmatter}\n\n${content}`;

  // Write atomically (write to temp, then rename)
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, fullContent, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);

  return {
    auditId: filenameToId(filename),
    path: filePath,
  };
}

/**
 * Get recent audits for a project.
 *
 * @param projectId - The project ID
 * @param limit - Maximum number of audits to return (default: 5)
 * @returns Array of audit summaries, sorted by date descending
 */
export function getRecentAudits(projectId: string, limit = 5): AuditSummary[] {
  if (!validateProjectId(projectId)) {
    return [];
  }

  const auditsDir = getAuditsDir(projectId);
  if (!fs.existsSync(auditsDir)) {
    return [];
  }

  // List all .md files in audits directory
  const files = fs
    .readdirSync(auditsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);

  // Sort by filename (date prefix) descending
  files.sort((a, b) => b.localeCompare(a));

  // Take top N and parse
  const audits: AuditSummary[] = [];

  for (const filename of files.slice(0, limit)) {
    try {
      const filePath = path.join(auditsDir, filename);
      const content = fs.readFileSync(filePath, "utf-8");
      const metadata = parseFrontmatter(content);

      if (metadata) {
        audits.push({
          id: filenameToId(filename),
          target: metadata.target,
          generatedAt: metadata.generatedAt,
          filename,
          topRecommendation: extractTopRecommendation(content),
        });
      }
    } catch {
      // Skip files that can't be read/parsed
    }
  }

  return audits;
}

/**
 * Get a specific audit by target.
 * Returns the most recent audit for the given target.
 *
 * @param projectId - The project ID
 * @param target - The audit target to search for
 * @returns Full audit detail or null if not found
 */
export function getAuditByTarget(
  projectId: string,
  target: string
): AuditDetail | null {
  if (!validateProjectId(projectId)) {
    return null;
  }

  const auditsDir = getAuditsDir(projectId);
  if (!fs.existsSync(auditsDir)) {
    return null;
  }

  // List all .md files and find matching target
  const files = fs
    .readdirSync(auditsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);

  // Sort descending to get most recent first
  files.sort((a, b) => b.localeCompare(a));

  for (const filename of files) {
    try {
      const filePath = path.join(auditsDir, filename);
      const content = fs.readFileSync(filePath, "utf-8");
      const metadata = parseFrontmatter(content);

      if (metadata && metadata.target === target) {
        return {
          id: filenameToId(filename),
          target: metadata.target,
          metadata,
          content: extractBody(content),
          filename,
        };
      }
    } catch {
      // Skip files that can't be read/parsed
    }
  }

  return null;
}

/**
 * Get a specific audit by ID.
 *
 * @param projectId - The project ID
 * @param auditId - The audit ID (filename without .md)
 * @returns Full audit detail or null if not found
 */
export function getAuditById(
  projectId: string,
  auditId: string
): AuditDetail | null {
  if (!validateProjectId(projectId)) {
    return null;
  }

  // Sanitize auditId to prevent path traversal
  if (auditId.includes("/") || auditId.includes("\\") || auditId.includes("..")) {
    return null;
  }

  const auditsDir = getAuditsDir(projectId);
  const filename = `${auditId}.md`;
  const filePath = path.join(auditsDir, filename);

  // Verify path is within audits directory
  const resolvedPath = path.resolve(filePath);
  const resolvedAuditsDir = path.resolve(auditsDir);
  if (!resolvedPath.startsWith(resolvedAuditsDir + path.sep)) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const metadata = parseFrontmatter(content);

    if (!metadata) {
      return null;
    }

    return {
      id: auditId,
      target: metadata.target,
      metadata,
      content: extractBody(content),
      filename,
    };
  } catch {
    return null;
  }
}

/**
 * Count audits for a project.
 */
export function countAudits(projectId: string): number {
  if (!validateProjectId(projectId)) {
    return 0;
  }

  const auditsDir = getAuditsDir(projectId);
  if (!fs.existsSync(auditsDir)) {
    return 0;
  }

  return fs
    .readdirSync(auditsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
}
