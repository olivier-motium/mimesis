/**
 * usePtyInitialization - Shared hook for PTY session management
 *
 * Consolidates the PTY initialization logic used by both TerminalDock and Viewport.
 * Handles get-or-create PTY in a single API call.
 *
 * Supports optional tabId for segment rotation ("kitty effect"):
 * - When tabId is provided, it's injected as COMMAND_CENTER_TAB_ID in the PTY env
 * - This enables hooks to track segment changes within a stable tab
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ensurePty, type PtyInfo } from "../lib/api";

export interface PtyState {
  ptyInfo: PtyInfo | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
}

export interface PtyInitOptions {
  /** Stable tab ID for segment tracking (enables "kitty effect") */
  tabId?: string;
  /** Initial terminal dimensions */
  cols?: number;
  rows?: number;
}

/**
 * Hook to manage PTY initialization for a session.
 *
 * @param sessionId - The session ID to initialize PTY for (null to reset)
 * @param options - Optional PTY initialization options (tabId for segment tracking)
 * @returns PTY state and control functions
 */
export function usePtyInitialization(
  sessionId: string | null,
  options?: PtyInitOptions
) {
  const [state, setState] = useState<PtyState>({
    ptyInfo: null,
    isLoading: false,
    error: null,
    isConnected: false,
  });

  // Track which session we've already initialized PTY for
  const initializedSessionRef = useRef<string | null>(null);

  // Initialize PTY for a session
  const initializePty = useCallback(
    async (id: string) => {
      if (initializedSessionRef.current === id) {
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      initializedSessionRef.current = id;

      try {
        // Single API call - daemon handles get-or-create
        // Pass tabId and dimensions if provided
        const ptyInfo = await ensurePty(id, {
          tabId: options?.tabId,
          cols: options?.cols,
          rows: options?.rows,
        });
        setState({
          ptyInfo,
          isLoading: false,
          error: null,
          isConnected: false,
        });
      } catch (err) {
        console.error("[usePtyInitialization] Failed to initialize PTY:", err);
        setState({
          ptyInfo: null,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to create terminal",
          isConnected: false,
        });
        initializedSessionRef.current = null;
      }
    },
    [options?.tabId, options?.cols, options?.rows]
  );

  // Reset state
  const reset = useCallback(() => {
    setState({
      ptyInfo: null,
      isLoading: false,
      error: null,
      isConnected: false,
    });
    initializedSessionRef.current = null;
  }, []);

  // Retry initialization
  const retry = useCallback(() => {
    if (sessionId) {
      initializedSessionRef.current = null;
      initializePty(sessionId);
    }
  }, [sessionId, initializePty]);

  // Handle connection status changes
  const setConnected = useCallback((connected: boolean) => {
    setState((prev) => ({ ...prev, isConnected: connected }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  // Initialize when session changes
  useEffect(() => {
    if (sessionId) {
      initializePty(sessionId);
    } else {
      reset();
    }
  }, [sessionId, initializePty, reset]);

  return {
    ...state,
    retry,
    reset,
    setConnected,
    setError,
  };
}
