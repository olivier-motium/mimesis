/**
 * Parser for status.v5 YAML frontmatter files.
 * Extracts structured briefing data from status files written by Claude Code hooks.
 */

import { z } from "zod";

/**
 * Schema for status.v5 YAML frontmatter.
 */
export const StatusV5Schema = z.object({
  schema: z.literal("status.v5").optional(),

  // Identity
  project_id: z.string().optional(),
  repo_name: z.string().optional(),
  repo_root: z.string().optional(),
  git_remote: z.string().optional(),
  branch: z.string().optional(),

  // Session + task
  session_id: z.string().optional(),
  task_id: z.string().optional(),
  status: z.enum(["completed", "blocked", "failed", "waiting_for_input", "working", "idle"]),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),

  // Semantic fields (Sonnet-authored)
  impact_level: z.enum(["trivial", "minor", "moderate", "major"]).optional(),
  broadcast_level: z.enum(["silent", "mention", "highlight"]).optional(),
  doc_drift_risk: z.enum(["low", "medium", "high"]).optional(),

  // Traceability
  base_commit: z.string().optional(),
  head_commit: z.string().optional(),

  // Structured lists
  blockers: z.array(z.string()).optional(),
  next_steps: z.array(z.string()).optional(),
  docs_touched: z.array(z.string()).optional(),
  files_touched: z.array(z.string()).optional(),
});

export type StatusV5 = z.infer<typeof StatusV5Schema>;

/**
 * Result of parsing a status.v5 file.
 */
export interface ParsedStatusV5 {
  frontmatter: StatusV5;
  markdown: string;
  isV5: boolean;
}

/**
 * Parse a status.v5 file content.
 * Extracts YAML frontmatter and markdown body.
 *
 * @param content - Raw file content
 * @returns Parsed status with frontmatter and markdown
 * @throws Error if frontmatter is invalid or missing
 */
export function parseStatusV5(content: string): ParsedStatusV5 {
  const lines = content.split("\n");

  // Find frontmatter delimiters
  if (lines[0]?.trim() !== "---") {
    throw new Error("Missing frontmatter: file must start with ---");
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error("Missing frontmatter: no closing ---");
  }

  // Extract frontmatter YAML
  const frontmatterLines = lines.slice(1, endIndex);
  const frontmatterYaml = frontmatterLines.join("\n");

  // Parse YAML manually (simple key-value with list support)
  const parsed = parseSimpleYaml(frontmatterYaml);

  // Validate against schema
  const result = StatusV5Schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid frontmatter: ${result.error.message}`);
  }

  // Extract markdown body
  const markdownLines = lines.slice(endIndex + 1);
  const markdown = markdownLines.join("\n").trim();

  return {
    frontmatter: result.data,
    markdown,
    isV5: parsed.schema === "status.v5",
  };
}

/**
 * Try to parse a status file, returning null if it's not a v5 file or is invalid.
 */
export function tryParseStatusV5(content: string): ParsedStatusV5 | null {
  try {
    const result = parseStatusV5(content);
    // Only return if it's explicitly a v5 file or has v5-specific fields
    if (result.isV5 || result.frontmatter.project_id || result.frontmatter.task_id) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Simple YAML parser for status frontmatter.
 * Handles:
 * - key: value pairs
 * - key: [array, items] (inline)
 * - key:
 *   - list item (block list)
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Check for list item (indented with -)
    const listMatch = line.match(/^\s+-\s*(.*)$/);
    if (listMatch && currentKey && currentList !== null) {
      currentList.push(listMatch[1].trim());
      continue;
    }

    // If we were building a list, save it
    if (currentKey && currentList !== null) {
      result[currentKey] = currentList;
      currentKey = null;
      currentList = null;
    }

    // Parse key: value
    const kvMatch = trimmed.match(/^([a-z_]+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();

      // Check for inline array [a, b, c]
      if (value.startsWith("[") && value.endsWith("]")) {
        const items = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        result[key] = items;
        continue;
      }

      // Check for empty value (start of block list)
      if (value === "") {
        currentKey = key;
        currentList = [];
        continue;
      }

      // Regular scalar value
      result[key] = parseScalarValue(value);
    }
  }

  // Handle trailing list
  if (currentKey && currentList !== null) {
    result[currentKey] = currentList;
  }

  return result;
}

/**
 * Parse a YAML scalar value.
 */
function parseScalarValue(value: string): string | boolean | number | null {
  // Remove quotes if present
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;

  // Null
  if (value === "null" || value === "~") return null;

  // Number (only if it looks like a number)
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  return value;
}

/**
 * Generate a status.v5 file content from structured data.
 */
export function generateStatusV5(
  frontmatter: Partial<StatusV5>,
  markdown: string
): string {
  const lines: string[] = ["---", "schema: status.v5"];

  // Identity
  if (frontmatter.project_id) lines.push(`project_id: ${frontmatter.project_id}`);
  if (frontmatter.repo_name) lines.push(`repo_name: ${frontmatter.repo_name}`);
  if (frontmatter.repo_root) lines.push(`repo_root: ${frontmatter.repo_root}`);
  if (frontmatter.git_remote) lines.push(`git_remote: ${frontmatter.git_remote}`);
  if (frontmatter.branch) lines.push(`branch: ${frontmatter.branch}`);

  // Session + task
  if (frontmatter.session_id) lines.push(`session_id: ${frontmatter.session_id}`);
  if (frontmatter.task_id) lines.push(`task_id: ${frontmatter.task_id}`);
  if (frontmatter.status) lines.push(`status: ${frontmatter.status}`);
  if (frontmatter.started_at) lines.push(`started_at: ${frontmatter.started_at}`);
  if (frontmatter.ended_at) lines.push(`ended_at: ${frontmatter.ended_at}`);

  // Semantic fields
  if (frontmatter.impact_level) lines.push(`impact_level: ${frontmatter.impact_level}`);
  if (frontmatter.broadcast_level) lines.push(`broadcast_level: ${frontmatter.broadcast_level}`);
  if (frontmatter.doc_drift_risk) lines.push(`doc_drift_risk: ${frontmatter.doc_drift_risk}`);

  // Traceability
  if (frontmatter.base_commit) lines.push(`base_commit: ${frontmatter.base_commit}`);
  if (frontmatter.head_commit) lines.push(`head_commit: ${frontmatter.head_commit}`);

  // Structured lists
  if (frontmatter.blockers?.length) {
    lines.push("blockers:");
    for (const item of frontmatter.blockers) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push("blockers: []");
  }

  if (frontmatter.next_steps?.length) {
    lines.push("next_steps:");
    for (const item of frontmatter.next_steps) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push("next_steps: []");
  }

  if (frontmatter.docs_touched?.length) {
    lines.push("docs_touched:");
    for (const item of frontmatter.docs_touched) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push("docs_touched: []");
  }

  if (frontmatter.files_touched?.length) {
    lines.push("files_touched:");
    for (const item of frontmatter.files_touched) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push("files_touched: []");
  }

  lines.push("---");
  lines.push("");
  lines.push(markdown);

  return lines.join("\n");
}
