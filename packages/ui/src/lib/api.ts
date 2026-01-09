/**
 * API client for kitty terminal remote control endpoints.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4451/api";

/** Detailed kitty status for diagnostics */
interface KittyStatusDetails {
  installed: boolean;
  running: boolean;
  socketExists: boolean;
  socketReachable: boolean;
  configExists: boolean;
}

/** Health check response with detailed status */
export interface KittyHealthResponse {
  available: boolean;
  details: KittyStatusDetails;
}

/** Result of kitty setup operation */
export interface KittySetupResponse {
  success: boolean;
  status: string;
  message: string;
  actions: string[];
}

interface ApiResponse {
  success?: boolean;
  error?: string;
  windowId?: number;
  created?: boolean;
  stale?: boolean;
}

/**
 * Make an API call with proper error handling.
 */
async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if kitty terminal is available with detailed status.
 */
export async function getKittyHealth(): Promise<KittyHealthResponse> {
  return apiCall("/kitty/health");
}

/**
 * Trigger kitty remote control setup.
 */
export async function runKittySetup(): Promise<KittySetupResponse> {
  return apiCall("/kitty/setup", { method: "POST" });
}

/**
 * Focus an existing linked terminal for a session.
 */
export async function focusSession(sessionId: string): Promise<ApiResponse> {
  return apiCall(`/sessions/${sessionId}/focus`, { method: "POST" });
}

/**
 * Open or focus a terminal for a session.
 * Creates a new tab if no terminal is linked.
 */
export async function openSession(sessionId: string): Promise<ApiResponse> {
  return apiCall(`/sessions/${sessionId}/open`, { method: "POST" });
}

/**
 * Link an existing terminal to a session via interactive selection.
 */
export async function linkTerminal(sessionId: string): Promise<ApiResponse> {
  return apiCall(`/sessions/${sessionId}/link-terminal`, { method: "POST" });
}

/**
 * Unlink a terminal from a session.
 */
export async function unlinkTerminal(sessionId: string): Promise<ApiResponse> {
  return apiCall(`/sessions/${sessionId}/link-terminal`, { method: "DELETE" });
}

/**
 * Delete a session permanently (removes JSONL file from disk).
 */
export async function deleteSession(sessionId: string): Promise<ApiResponse> {
  return apiCall(`/sessions/${sessionId}`, { method: "DELETE" });
}

/**
 * Rename a work chain (set user-defined name).
 */
export async function renameWorkChain(
  workChainId: string,
  name: string | null
): Promise<ApiResponse & { sessionId?: string }> {
  return apiCall(`/workchains/${workChainId}/name`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

/**
 * Send text to a session's linked terminal.
 */
export async function sendText(
  sessionId: string,
  text: string,
  submit: boolean
): Promise<ApiResponse> {
  return apiCall(`/sessions/${sessionId}/send-text`, {
    method: "POST",
    body: JSON.stringify({ text, submit }),
  });
}

// =============================================================================
// PTY (Embedded Terminal) API
// =============================================================================

/** PTY session info returned from API */
export interface PtyInfo {
  ptyId: string;
  wsUrl: string;
  wsToken: string;
  active: boolean;
  connectedClients: number;
}

/**
 * Create a PTY session for embedded terminal.
 * @param tabId - Optional tab ID for segment tracking (enables "kitty effect")
 */
export async function createPty(
  sessionId: string,
  options?: { cols?: number; rows?: number; tabId?: string }
): Promise<PtyInfo> {
  return apiCall(`/sessions/${sessionId}/pty`, {
    method: "POST",
    body: options ? JSON.stringify(options) : undefined,
  });
}

/**
 * Get existing PTY info for a session.
 */
export async function getPty(sessionId: string): Promise<PtyInfo | null> {
  try {
    return await apiCall(`/sessions/${sessionId}/pty`);
  } catch {
    return null;
  }
}

/**
 * Ensure a PTY exists for a session (get or create in single call).
 * This is the preferred method - eliminates the sequential GET then POST pattern.
 * The daemon's POST endpoint is idempotent (returns existing PTY if found).
 */
export async function ensurePty(
  sessionId: string,
  options?: { cols?: number; rows?: number }
): Promise<PtyInfo> {
  return createPty(sessionId, options);
}

/**
 * Destroy a PTY session.
 */
export async function destroyPty(sessionId: string): Promise<ApiResponse> {
  return apiCall(`/sessions/${sessionId}/pty`, { method: "DELETE" });
}

/**
 * Resize a PTY session.
 */
export async function resizePty(
  sessionId: string,
  cols: number,
  rows: number
): Promise<ApiResponse> {
  return apiCall(`/sessions/${sessionId}/pty/resize`, {
    method: "POST",
    body: JSON.stringify({ cols, rows }),
  });
}

// =============================================================================
// Tab (Segment Rotation) API
// =============================================================================

/** Segment reason for why a segment was created */
export type SegmentReason = "startup" | "resume" | "compact" | "clear";

/** Trigger for compaction */
export type CompactTrigger = "auto" | "manual";

/** One segment of work within a tab (one Claude session) */
export interface ClaudeSegment {
  sessionId: string;
  transcriptPath: string;
  startedAt: string;
  endedAt?: string;
  reason: SegmentReason;
  trigger?: CompactTrigger;
}

/** Stable UI tab that persists across compactions */
export interface TerminalTab {
  tabId: string;
  ptyId?: string;
  repoRoot: string;
  segments: ClaudeSegment[];
  activeSegmentIndex: number;
  createdAt: string;
  lastActivityAt: string;
}

/**
 * Create a new terminal tab.
 * Returns a stable tab ID to use with PTY creation.
 */
export async function createTab(repoRoot: string): Promise<{ tab: TerminalTab }> {
  return apiCall("/tabs", {
    method: "POST",
    body: JSON.stringify({ repoRoot }),
  });
}

/**
 * Get all terminal tabs.
 */
export async function getTabs(): Promise<{ tabs: TerminalTab[]; count: number }> {
  return apiCall("/tabs");
}

/**
 * Get a specific terminal tab by ID.
 */
export async function getTab(tabId: string): Promise<{ tab: TerminalTab }> {
  return apiCall(`/tabs/${tabId}`);
}

/**
 * Delete a terminal tab.
 */
export async function deleteTab(tabId: string): Promise<ApiResponse> {
  return apiCall(`/tabs/${tabId}`, { method: "DELETE" });
}
