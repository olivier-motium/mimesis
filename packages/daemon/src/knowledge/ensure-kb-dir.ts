/**
 * Utility to ensure knowledge base directory structure exists.
 * Creates directories and initial files on first run.
 */

import fs from "node:fs";
import path from "node:path";
import {
  KNOWLEDGE_DIR,
  KNOWLEDGE_ALIASES_FILE,
  KNOWLEDGE_BY_NAME_DIR,
} from "../config/fleet.js";

/**
 * Type for the aliases.json file structure.
 * Contains auto-generated aliases (string -> string) plus _manual_overrides.
 */
export interface AliasesFile {
  _manual_overrides?: Record<string, string>;
  [key: string]: string | Record<string, string> | undefined;
}

/** Initial aliases.json content with empty manual overrides */
const INITIAL_ALIASES = JSON.stringify({ _manual_overrides: {} }, null, 2);

/**
 * Ensure the knowledge base directory structure exists.
 * Creates:
 * - ~/.claude/commander/knowledge/
 * - ~/.claude/commander/knowledge/by-name/
 * - ~/.claude/commander/knowledge/aliases.json (if missing)
 *
 * Sets permissions to 700 for security.
 */
export function ensureKbDir(): void {
  // Create main knowledge directory
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true, mode: 0o700 });
  }

  // Create by-name symlinks directory
  if (!fs.existsSync(KNOWLEDGE_BY_NAME_DIR)) {
    fs.mkdirSync(KNOWLEDGE_BY_NAME_DIR, { recursive: true, mode: 0o700 });
  }

  // Create aliases.json if missing
  if (!fs.existsSync(KNOWLEDGE_ALIASES_FILE)) {
    fs.writeFileSync(KNOWLEDGE_ALIASES_FILE, INITIAL_ALIASES, { mode: 0o600 });
  }

  // Ensure correct permissions on existing directory
  try {
    fs.chmodSync(KNOWLEDGE_DIR, 0o700);
  } catch {
    // Ignore permission errors (might not have access)
  }
}

/**
 * Check if knowledge base is initialized.
 */
export function isKbInitialized(): boolean {
  return (
    fs.existsSync(KNOWLEDGE_DIR) &&
    fs.existsSync(KNOWLEDGE_BY_NAME_DIR) &&
    fs.existsSync(KNOWLEDGE_ALIASES_FILE)
  );
}

/**
 * Get the path to a project's knowledge directory.
 */
export function getProjectKbDir(projectId: string): string {
  return path.join(KNOWLEDGE_DIR, projectId);
}

/**
 * Ensure a project's knowledge directory exists.
 */
export function ensureProjectKbDir(projectId: string): string {
  const projectDir = getProjectKbDir(projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true, mode: 0o700 });
  }
  return projectDir;
}

/**
 * List all project directories in the knowledge base.
 * Returns array of project_id strings (directory names matching *__* pattern).
 */
export function listKbProjects(): string[] {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    return [];
  }

  return fs
    .readdirSync(KNOWLEDGE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes("__"))
    .map((entry) => entry.name);
}

/**
 * Load aliases from aliases.json.
 */
export function loadAliases(): AliasesFile {
  if (!fs.existsSync(KNOWLEDGE_ALIASES_FILE)) {
    return { _manual_overrides: {} };
  }

  try {
    const content = fs.readFileSync(KNOWLEDGE_ALIASES_FILE, "utf-8");
    return JSON.parse(content) as AliasesFile;
  } catch {
    return { _manual_overrides: {} };
  }
}

/**
 * Save aliases to aliases.json.
 */
export function saveAliases(aliases: AliasesFile): void {
  ensureKbDir();
  fs.writeFileSync(KNOWLEDGE_ALIASES_FILE, JSON.stringify(aliases, null, 2), {
    mode: 0o600,
  });
}

/**
 * Regenerate aliases from KB directories.
 * Preserves manual overrides.
 */
export function regenerateAliases(): {
  aliases: Record<string, string>;
  conflicts: Array<{ repoName: string; existing: string; skipped: string }>;
} {
  const existing = loadAliases();
  const manualOverrides = existing._manual_overrides ?? {};

  const autoAliases: Record<string, string> = {};
  const conflicts: Array<{ repoName: string; existing: string; skipped: string }> = [];

  for (const projectDir of listKbProjects()) {
    const repoName = projectDir.split("__")[0];

    if (repoName in autoAliases) {
      // Conflict: same repo name, different hash
      conflicts.push({
        repoName,
        existing: autoAliases[repoName],
        skipped: projectDir,
      });
    } else {
      autoAliases[repoName] = projectDir;
    }
  }

  // Save with manual overrides preserved
  const output = { ...autoAliases, _manual_overrides: manualOverrides };
  saveAliases(output);

  // Regenerate symlinks
  regenerateSymlinks(autoAliases);

  return { aliases: autoAliases, conflicts };
}

/**
 * Regenerate by-name symlinks.
 */
export function regenerateSymlinks(aliases: Record<string, string>): void {
  if (!fs.existsSync(KNOWLEDGE_BY_NAME_DIR)) {
    fs.mkdirSync(KNOWLEDGE_BY_NAME_DIR, { recursive: true, mode: 0o700 });
  }

  // Remove existing symlinks
  for (const entry of fs.readdirSync(KNOWLEDGE_BY_NAME_DIR, {
    withFileTypes: true,
  })) {
    if (entry.isSymbolicLink()) {
      fs.unlinkSync(path.join(KNOWLEDGE_BY_NAME_DIR, entry.name));
    }
  }

  // Create new symlinks
  for (const [name, projectId] of Object.entries(aliases)) {
    if (name === "_manual_overrides") continue;

    const linkPath = path.join(KNOWLEDGE_BY_NAME_DIR, name);
    const targetPath = path.join("..", projectId);

    try {
      fs.symlinkSync(targetPath, linkPath);
    } catch {
      // Ignore errors (might be permission issues)
    }
  }
}

/**
 * Resolve a project name/alias to canonical project_id.
 * Tries in order:
 * 1. Exact project_id match
 * 2. Manual override alias
 * 3. Auto-generated alias
 * 4. Unique repo_name prefix match
 *
 * @throws Error if ambiguous or not found
 */
export function resolveProjectId(input: string): string {
  const projects = listKbProjects();
  const aliases = loadAliases();
  const manualOverrides = aliases._manual_overrides ?? {};

  // 1. Exact project_id match
  if (projects.includes(input)) {
    return input;
  }

  // 2. Manual override alias
  if (input in manualOverrides) {
    return manualOverrides[input];
  }

  // 3. Auto-generated alias (skip _manual_overrides key)
  const aliasValue = aliases[input];
  if (typeof aliasValue === "string") {
    return aliasValue;
  }

  // 4. Unique repo_name prefix match
  const matches = projects.filter((p) => p.startsWith(`${input}__`));
  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(
      `Ambiguous project name '${input}'. Matches: ${matches.join(", ")}`
    );
  }

  throw new Error(`Project '${input}' not found in knowledge base`);
}
