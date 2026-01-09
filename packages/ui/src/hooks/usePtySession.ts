/**
 * Hook for managing PTY session lifecycle.
 *
 * Handles:
 * - Checking for existing PTY
 * - Creating PTY on demand
 * - Loading and error states
 */

import { useState, useCallback, useEffect } from "react";
import { createPty, getPty, destroyPty, type PtyInfo } from "../lib/api";

export interface UsePtySessionResult {
  /** Current PTY info (null if none exists) */
  ptyInfo: PtyInfo | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Create a new PTY session */
  createPtySession: () => Promise<void>;
  /** Destroy the PTY session */
  destroyPtySession: () => Promise<void>;
  /** Refresh PTY info */
  refresh: () => Promise<void>;
}

/**
 * Hook for managing PTY session for a Claude Code session.
 */
export function usePtySession(sessionId: string): UsePtySessionResult {
  const [ptyInfo, setPtyInfo] = useState<PtyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing PTY on mount
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await getPty(sessionId);
      setPtyInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check PTY");
      setPtyInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Create PTY session
  const createPtySession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await createPty(sessionId);
      setPtyInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PTY");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Destroy PTY session
  const destroyPtySession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await destroyPty(sessionId);
      setPtyInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to destroy PTY");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  return {
    ptyInfo,
    isLoading,
    error,
    createPtySession,
    destroyPtySession,
    refresh,
  };
}
