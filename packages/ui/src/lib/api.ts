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
 */
export async function createPty(
  sessionId: string,
  options?: { cols?: number; rows?: number }
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
