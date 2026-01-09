#!/usr/bin/env node

import { SessionWatcher, type SessionEvent, type SessionState } from "./watcher.js";
import { formatStatus, getStatusKey } from "./status-derivation.js";
import { RECENT_THRESHOLD_MS } from "./config/index.js";
import { colors } from "./utils/colors.js";

// Parse CLI args
const args = process.argv.slice(2);
const showOnlyRecent = args.includes("--recent") || args.includes("-r");
const showOnlyActive = args.includes("--active") || args.includes("-a");
const helpRequested = args.includes("--help") || args.includes("-h");

function formatTime(isoString: string): string {
  if (!isoString) return "unknown";
  const date = new Date(isoString);
  return date.toLocaleTimeString();
}

function formatRelativeTime(isoString: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 1000) return "just now";
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  return `${Math.floor(diffMs / 3600000)}h ago`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function formatPrompt(prompt: string): string {
  // Remove newlines and extra whitespace
  return truncate(prompt.replace(/\s+/g, " ").trim(), 60);
}

function formatCwd(cwd: string): string {
  // Shorten home directory
  const home = process.env.HOME ?? "";
  if (cwd.startsWith(home)) {
    return "~" + cwd.slice(home.length);
  }
  return cwd;
}

function formatRepoLabel(session: SessionState): string {
  if (session.gitRepoId) {
    return `${colors.blue}${session.gitRepoId}${colors.reset}`;
  }
  return `${colors.gray}(no repo)${colors.reset}`;
}

function logSessionEvent(event: SessionEvent): void {
  const { type, session, previousStatus } = event;
  const timestamp = new Date().toLocaleTimeString();

  const cwdShort = formatCwd(session.cwd);
  const status = formatStatus(session.status);
  const prompt = formatPrompt(session.originalPrompt);
  const branch = session.gitBranch ? `${colors.magenta}${session.gitBranch}${colors.reset}` : "";
  const repo = formatRepoLabel(session);
  const lastActivity = formatRelativeTime(session.status.lastActivityAt);
  const msgCount = session.status.messageCount;

  console.log();

  switch (type) {
    case "created":
      console.log(
        `${colors.gray}${timestamp}${colors.reset} ${colors.green}[NEW]${colors.reset} ${colors.cyan}${session.sessionId.slice(0, 8)}${colors.reset} ${repo}`
      );
      console.log(`  ${colors.bold}${cwdShort}${colors.reset} ${branch}`);
      console.log(`  ${colors.dim}"${prompt}"${colors.reset}`);
      console.log(`  ${status} | ${msgCount} msgs | ${lastActivity}`);
      break;

    case "updated":
      const prevStatusKey = previousStatus ? getStatusKey(previousStatus) : "?";
      const newStatusKey = getStatusKey(session.status);
      console.log(
        `${colors.gray}${timestamp}${colors.reset} ${colors.yellow}[CHG]${colors.reset} ${colors.cyan}${session.sessionId.slice(0, 8)}${colors.reset} ${repo} ${colors.dim}${prevStatusKey} → ${newStatusKey}${colors.reset}`
      );
      console.log(`  ${colors.bold}${cwdShort}${colors.reset} ${branch}`);
      console.log(`  ${status} | ${msgCount} msgs | ${lastActivity}`);
      break;

    case "deleted":
      console.log(
        `${colors.gray}${timestamp}${colors.reset} ${colors.blue}[DEL]${colors.reset} ${colors.cyan}${session.sessionId.slice(0, 8)}${colors.reset}`
      );
      console.log(`  ${colors.dim}${cwdShort}${colors.reset}`);
      break;
  }
}

function shouldShowSession(session: SessionState): boolean {
  if (showOnlyActive && session.status.status === "idle") {
    return false;
  }
  if (showOnlyRecent) {
    const lastActivity = new Date(session.status.lastActivityAt).getTime();
    if (Date.now() - lastActivity > RECENT_THRESHOLD_MS) {
      return false;
    }
  }
  return true;
}

// ===========================================================================
// Session Grouping Helpers
// ===========================================================================

const OTHER_REPO_KEY = "__other__";

type SessionsByRepo = Map<string, SessionState[]>;
type SessionsByCwd = Map<string, SessionState[]>;

/**
 * Group sessions by repository ID.
 */
function groupSessionsByRepo(sessions: SessionState[]): SessionsByRepo {
  const byRepo = new Map<string, SessionState[]>();
  for (const session of sessions) {
    const key = session.gitRepoId ?? OTHER_REPO_KEY;
    const existing = byRepo.get(key) ?? [];
    existing.push(session);
    byRepo.set(key, existing);
  }
  return byRepo;
}

/**
 * Group sessions by working directory.
 */
function groupSessionsByCwd(sessions: SessionState[]): SessionsByCwd {
  const byCwd = new Map<string, SessionState[]>();
  for (const session of sessions) {
    const existing = byCwd.get(session.cwd) ?? [];
    existing.push(session);
    byCwd.set(session.cwd, existing);
  }
  return byCwd;
}

/**
 * Sort repo keys: GitHub repos first (alphabetically), then "Other".
 */
function sortRepoKeys(keys: string[]): string[] {
  return keys.sort((a, b) => {
    if (a === OTHER_REPO_KEY) return 1;
    if (b === OTHER_REPO_KEY) return -1;
    return a.localeCompare(b);
  });
}

// ===========================================================================
// Session Printing Helpers
// ===========================================================================

/**
 * Print a single session's details.
 */
function printSession(session: SessionState, indent: string): void {
  const status = formatStatus(session.status);
  const prompt = formatPrompt(session.originalPrompt);
  const branch = session.gitBranch
    ? ` ${colors.magenta}(${session.gitBranch})${colors.reset}`
    : "";
  const lastActivity = formatRelativeTime(session.status.lastActivityAt);

  console.log(
    `${indent}${colors.cyan}${session.sessionId.slice(0, 8)}${colors.reset}${branch} ${status}`
  );
  console.log(`${indent}  ${colors.dim}"${prompt}"${colors.reset}`);
  console.log(`${indent}  ${colors.gray}${session.status.messageCount} msgs | ${lastActivity}${colors.reset}`);
}

/**
 * Print the header for a repository section.
 */
function printRepoHeader(repoKey: string): void {
  if (repoKey === OTHER_REPO_KEY) {
    console.log(`${colors.bold}${colors.gray}Other (no GitHub repo)${colors.reset}`);
  } else {
    console.log(`${colors.bold}${colors.blue}${repoKey}${colors.reset}`);
  }
}

/**
 * Print all sessions in a repository section.
 */
function printRepoSection(repoSessions: SessionState[]): void {
  const byCwd = groupSessionsByCwd(repoSessions);
  const hasMultipleCwds = byCwd.size > 1;
  const indent = hasMultipleCwds ? "    " : "  ";

  for (const [cwd, cwdSessions] of byCwd) {
    if (hasMultipleCwds) {
      console.log(`  ${colors.dim}${formatCwd(cwd)}${colors.reset}`);
    }
    for (const session of cwdSessions) {
      printSession(session, indent);
    }
  }
}

// ===========================================================================
// Main Display Function
// ===========================================================================

function logInitialSessions(sessions: Map<string, SessionState>): void {
  // Filter and sort sessions
  const filteredSessions = Array.from(sessions.values())
    .filter(shouldShowSession)
    .sort((a, b) => {
      const aTime = new Date(a.status.lastActivityAt).getTime();
      const bTime = new Date(b.status.lastActivityAt).getTime();
      return bTime - aTime;
    });

  // Print header
  console.log();
  const filterLabel = showOnlyActive ? "Active" : showOnlyRecent ? "Recent" : "All";
  console.log(`${colors.bold}=== ${filterLabel} Sessions (${filteredSessions.length}) ===${colors.reset}`);
  console.log();

  if (filteredSessions.length === 0) {
    console.log(`  ${colors.dim}No sessions found${colors.reset}`);
    return;
  }

  // Group by repo and print each section
  const byRepo = groupSessionsByRepo(filteredSessions);
  const sortedKeys = sortRepoKeys(Array.from(byRepo.keys()));

  for (const repoKey of sortedKeys) {
    const repoSessions = byRepo.get(repoKey)!;
    printRepoHeader(repoKey);
    printRepoSection(repoSessions);
    console.log();
  }
}

function printHelp(): void {
  console.log(`${colors.bold}Claude Code Session Watcher${colors.reset}`);
  console.log();
  console.log("Watches Claude Code session logs and displays real-time status updates.");
  console.log();
  console.log(`${colors.bold}Usage:${colors.reset}`);
  console.log("  pnpm watch [options]");
  console.log();
  console.log(`${colors.bold}Options:${colors.reset}`);
  console.log("  -r, --recent   Only show sessions active in the last hour");
  console.log("  -a, --active   Only show non-idle sessions (working/waiting)");
  console.log("  -h, --help     Show this help message");
  console.log();
  console.log(`${colors.bold}Status Icons:${colors.reset}`);
  console.log(`  ${colors.green}Working${colors.reset}    Claude is generating a response`);
  console.log(`  ${colors.yellow}Waiting${colors.reset}    Waiting for your input`);
  console.log(`  ${colors.yellow}Approval${colors.reset}   Waiting for tool approval`);
  console.log(`  ${colors.gray}Idle${colors.reset}       No activity for 5+ minutes`);
}

async function main(): Promise<void> {
  if (helpRequested) {
    printHelp();
    process.exit(0);
  }

  console.log(`${colors.bold}Claude Code Session Watcher${colors.reset}`);
  console.log(`${colors.dim}Watching ~/.claude/projects/**/*.jsonl${colors.reset}`);
  console.log();

  const watcher = new SessionWatcher({ debounceMs: 300 });

  watcher.on("session", (event: SessionEvent) => {
    logSessionEvent(event);
  });

  watcher.on("error", (error: Error) => {
    console.error(`${colors.yellow}[ERROR]${colors.reset}`, error.message);
  });

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log();
    console.log(`${colors.dim}Shutting down...${colors.reset}`);
    watcher.stop();
    process.exit(0);
  });

  // Start watching
  await watcher.start();

  // Log initial state
  logInitialSessions(watcher.getSessions());

  console.log();
  console.log(`${colors.dim}Watching for changes... (Ctrl+C to exit)${colors.reset}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
