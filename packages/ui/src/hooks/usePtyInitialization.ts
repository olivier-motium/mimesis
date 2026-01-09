/**
 * usePtyInitialization - Shared hook for PTY session management
 *
 * Consolidates the PTY initialization logic used by both TerminalDock and Viewport.
 * Handles get-or-create PTY in a single API call.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ensurePty, type PtyInfo } from "../lib/api";

export interface PtyState {
  ptyInfo: PtyInfo | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
}

/**
 * Hook to manage PTY initialization for a session.
 *
 * @param sessionId - The session ID to initialize PTY for (null to reset)
 * @returns PTY state and control functions
 */
export function usePtyInitialization(sessionId: string | null) {
  const [state, setState] = useState<PtyState>({
    ptyInfo: null,
    isLoading: false,
    error: null,
    isConnected: false,
  });

  // Track which session we've already initialized PTY for
  const initializedSessionRef = useRef<string | null>(null);

  // Initialize PTY for a session
  const initializePty = useCallback(async (id: string) => {
    if (initializedSessionRef.current === id) {
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    initializedSessionRef.current = id;

    try {
      // Single API call - daemon handles get-or-create
      const ptyInfo = await ensurePty(id);
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
  }, []);

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
