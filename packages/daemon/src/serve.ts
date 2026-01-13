#!/usr/bin/env node
/**
 * Fleet Commander Daemon
 *
 * Starts the Fleet Gateway (WebSocket) and REST API server.
 * The gateway provides:
 * - PTY session management
 * - Event streaming (PTY output + hook events)
 * - Fleet events (outbox broadcast)
 * - Headless job management (Commander, maintenance)
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { createConnection } from "node:net";
import { execSync } from "node:child_process";

// Load .env from project root (handles both src and dist execution)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPaths = [
  path.resolve(__dirname, "../../../.env"),  // from src/
  path.resolve(__dirname, "../../.env"),     // from dist/
  path.resolve(process.cwd(), ".env"),       // from cwd
];
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

// Initialize telemetry BEFORE other imports (must happen after dotenv)
import { initTelemetry, shutdownTelemetry } from "./telemetry/index.js";
initTelemetry();

// Validate configuration and create directories early
import { validateConfigOrThrow } from "./config/validation.js";
validateConfigOrThrow();

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { SessionWatcher, type SessionEvent, type SessionState } from "./watcher.js";
import { formatStatus } from "./status-derivation.js";
import {
  STREAM_HOST,
  API_PORT,
  API_PREFIX,
  MAX_AGE_HOURS,
  MAX_AGE_MS,
  FLEET_GATEWAY_HOST,
  FLEET_GATEWAY_PORT,
  FLEET_BASE_DIR,
  PORT_CHECK_SOCKET_TIMEOUT_MS,
  DAEMON_HEALTH_CHECK_TIMEOUT_MS,
  PORT_RELEASE_WAIT_MS,
  WATCHER_DEBOUNCE_MS,
  STATUS_WATCHER_DEBOUNCE_MS,
  SHUTDOWN_TIMEOUT_MS,
} from "./config/index.js";
import { colors } from "./utils/colors.js";
import { createApiRouter } from "./api/router.js";
import { KittyRc } from "./kitty-rc.js";
import { TerminalLinkRepo } from "./db/terminal-link-repo.js";
import { closeDb } from "./db/index.js";
import { setupKitty, getKittyStatus } from "./kitty-setup.js";
import { getErrorMessage } from "./utils/type-guards.js";
import { tabManager } from "./tab-manager.js";
import { GatewayServer } from "./gateway/index.js";
import { StatusWatcher } from "./status-watcher.js";


/**
 * Check if a session is recent enough to include
 */
function isRecentSession(session: SessionState): boolean {
  const lastActivity = new Date(session.status.lastActivityAt).getTime();
  return Date.now() - lastActivity < MAX_AGE_MS;
}

/**
 * Check if a port is in use by attempting to connect
 */
async function isPortInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    socket.setTimeout(PORT_CHECK_SOCKET_TIMEOUT_MS);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Kill process using a specific port (macOS/Linux)
 */
function killProcessOnPort(port: number): boolean {
  try {
    // Find PID using lsof
    const result = execSync(`lsof -t -i:${port}`, { encoding: "utf-8" }).trim();
    if (result) {
      const pids = result.split("\n");
      for (const pid of pids) {
        try {
          execSync(`kill -9 ${pid}`);
          console.log(`${colors.yellow}[STARTUP]${colors.reset} Killed stale process (PID ${pid}) on port ${port}`);
        } catch {
          // Process might have already exited
        }
      }
      return true;
    }
  } catch {
    // No process found or lsof not available
  }
  return false;
}

/**
 * Ensure port is available, handling stale processes
 */
async function ensurePortAvailable(port: number, host: string): Promise<void> {
  if (await isPortInUse(port, host)) {
    console.log(`${colors.yellow}[STARTUP]${colors.reset} Port ${port} is in use, checking if daemon is healthy...`);

    // Try to ping existing daemon's API health endpoint
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DAEMON_HEALTH_CHECK_TIMEOUT_MS);
      const response = await fetch(`http://${host}:${API_PORT}/api/v1/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (response.ok) {
        console.log(`${colors.green}[STARTUP]${colors.reset} Daemon already running and healthy - exiting`);
        console.log(`${colors.dim}To restart, kill the existing daemon first: lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill${colors.reset}`);
        process.exit(0);
      }
    } catch {
      // Daemon not responding, likely stale
    }

    // Try to kill stale process
    console.log(`${colors.yellow}[STARTUP]${colors.reset} Daemon not responding, attempting to clear stale process...`);
    if (killProcessOnPort(port)) {
      // Wait a moment for port to be released
      await new Promise((resolve) => setTimeout(resolve, PORT_RELEASE_WAIT_MS));

      // Verify port is now free
      if (await isPortInUse(port, host)) {
        console.error(`${colors.red}[STARTUP]${colors.reset} Port ${port} still in use after cleanup attempt`);
        console.error(`${colors.dim}Try manually: lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill -9${colors.reset}`);
        process.exit(1);
      }
    } else {
      console.error(`${colors.red}[STARTUP]${colors.reset} Unable to clear port ${port}`);
      console.error(`${colors.dim}Try manually: lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill -9${colors.reset}`);
      process.exit(1);
    }
  }
}

async function main(): Promise<void> {
  // Global error handlers to prevent silent crashes
  process.on('unhandledRejection', (reason) => {
    console.error(`${colors.red}[FATAL]${colors.reset} Unhandled Rejection:`, reason);
    // Don't exit - log and continue to keep daemon running
  });

  process.on('uncaughtException', (error) => {
    console.error(`${colors.red}[FATAL]${colors.reset} Uncaught Exception:`, error);
    process.exit(1);  // Exit cleanly on uncaught exceptions
  });

  console.log(`${colors.bold}Fleet Commander Daemon${colors.reset}`);
  console.log(`${colors.dim}Showing sessions from last ${MAX_AGE_HOURS} hours${colors.reset}`);
  console.log();

  // Note: Directory creation now handled by validateConfigOrThrow() at module load

  // Ensure ports are available before starting servers
  await ensurePortAvailable(API_PORT, STREAM_HOST);
  await ensurePortAvailable(FLEET_GATEWAY_PORT, FLEET_GATEWAY_HOST);

  // Start the session watcher early so Gateway can use it
  const watcher = new SessionWatcher({ debounceMs: WATCHER_DEBOUNCE_MS });

  // Start status watcher for file-based status updates
  const statusWatcher = new StatusWatcher({ debounceMs: STATUS_WATCHER_DEBOUNCE_MS });

  // Start the Fleet Gateway server with watchers (replaces Durable Streams and PTY server)
  const gatewayServer = new GatewayServer({
    sessionWatcher: watcher,
    statusWatcher: statusWatcher,
  });
  await gatewayServer.start();

  console.log(`Gateway URL: ${colors.cyan}ws://${FLEET_GATEWAY_HOST}:${FLEET_GATEWAY_PORT}${colors.reset}`);

  // Initialize kitty remote control and link repository
  const kittyRc = new KittyRc();
  const linkRepo = new TerminalLinkRepo();

  // Auto-setup kitty remote control if needed
  const kittyStatus = await getKittyStatus();

  if (!kittyStatus.installed) {
    console.log(`${colors.dim}[KITTY]${colors.reset} Not installed - terminal control disabled`);
  } else if (!kittyStatus.socketReachable) {
    console.log(`${colors.yellow}[KITTY]${colors.reset} Running automatic setup...`);

    const result = await setupKitty();

    for (const action of result.actions) {
      console.log(`${colors.green}[KITTY]${colors.reset} ${action}`);
    }

    if (result.success) {
      console.log(`${colors.green}[KITTY]${colors.reset} ${result.message}`);
    } else {
      console.log(`${colors.yellow}[KITTY]${colors.reset} ${result.message}`);
    }
  } else {
    console.log(`${colors.green}[KITTY]${colors.reset} Remote control ready`);
  }

  // Create API server with Hono
  const app = new Hono();
  app.route(
    API_PREFIX,
    createApiRouter({
      kittyRc,
      linkRepo,
      tabManager,
      getSession: (id) => watcher.getSessions().get(id),
      getAllSessions: () => watcher.getSessions(),
      deleteSession: (id) => watcher.deleteSession(id),
    })
  );

  // Start API server on separate port
  const apiServer = serve({
    fetch: app.fetch,
    port: API_PORT,
    hostname: STREAM_HOST,
  });
  console.log(`API server: ${colors.cyan}http://${STREAM_HOST}:${API_PORT}${API_PREFIX}${colors.reset}`);

  // Validate existing terminal links on startup
  const staleSessions = await linkRepo.validateAll(kittyRc);
  if (staleSessions.length > 0) {
    console.log(
      `${colors.yellow}[LINKS]${colors.reset} Marked ${staleSessions.length} terminal links as stale`
    );
  }

  console.log();

  watcher.on("session", async (event: SessionEvent) => {
    const { type, session } = event;

    // Only log recent sessions
    if (!isRecentSession(session) && type !== "deleted") {
      return;
    }

    const timestamp = new Date().toLocaleTimeString();

    // Log to console - show directory name for easier identification
    const statusStr = formatStatus(session.status);
    const dirName = session.cwd.split("/").pop() || session.cwd;
    console.log(
      `${colors.gray}${timestamp}${colors.reset} ` +
      `${type === "created" ? colors.green : type === "deleted" ? colors.blue : colors.yellow}[${type.toUpperCase().slice(0, 3)}]${colors.reset} ` +
      `${colors.cyan}${session.sessionId.slice(0, 8)}${colors.reset} ` +
      `${colors.dim}${dirName}${colors.reset} ` +
      `${statusStr}`
    );

    // Note: Sessions are now managed by the Gateway server
    // The watcher is kept for backward compatibility logging only
  });

  watcher.on("error", (error: Error) => {
    console.error(`${colors.yellow}[ERROR]${colors.reset}`, error.message);
  });

  // Handle shutdown with timeout to prevent hangs
  process.on("SIGINT", async () => {
    console.log();
    console.log(`${colors.dim}Shutting down...${colors.reset}`);

    // Set a shutdown timeout to force exit if cleanup hangs
    const shutdownTimeout = setTimeout(() => {
      console.error(`${colors.yellow}[WARN]${colors.reset} Shutdown timed out, forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      watcher.stop();
      apiServer.close();
      await gatewayServer.stop();
      closeDb();
      await shutdownTelemetry();
    } finally {
      clearTimeout(shutdownTimeout);
      process.exit(0);
    }
  });

  // Start watching - watcher emits "created" events for existing sessions
  // which are published via the event listener above (no duplicate loop needed)
  await watcher.start();

  const allSessions = watcher.getSessions();
  const recentSessions = Array.from(allSessions.values()).filter(isRecentSession);
  console.log(`${colors.dim}Found ${recentSessions.length} recent sessions (of ${allSessions.size} total)${colors.reset}`);

  console.log();
  console.log(`${colors.green}✓${colors.reset} Ready - watching for changes`);
  console.log(`${colors.dim}Press Ctrl+C to exit${colors.reset}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
