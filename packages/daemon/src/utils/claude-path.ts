/**
 * Claude CLI path resolution.
 *
 * Resolves the full path to the claude executable. Node.js spawn()
 * doesn't inherit PATH the same way as shell commands, so we need
 * to find the full path explicitly.
 */

import { execSync } from "node:child_process";

let cachedPath: string | null = null;

/**
 * Get the full path to the claude executable.
 * Uses `which` to find the path, with fallback to common locations.
 * Result is cached for the lifetime of the process.
 */
export function getClaudePath(): string {
  if (cachedPath) return cachedPath;

  try {
    cachedPath = execSync("which claude", { encoding: "utf-8" }).trim();
    return cachedPath;
  } catch {
    // which failed, try common locations
    const paths = [
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
      "/usr/bin/claude",
    ];
    for (const p of paths) {
      try {
        execSync(`test -x ${p}`);
        cachedPath = p;
        return p;
      } catch {
        // Path doesn't exist or isn't executable, try next
      }
    }
    // Fall back to hoping it's in PATH
    return "claude";
  }
}
