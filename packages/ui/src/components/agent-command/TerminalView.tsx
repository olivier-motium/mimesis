/**
 * TerminalView - Center terminal area
 *
 * Shows the terminal for the selected agent.
 * Reuses existing Terminal component and PTY logic.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Terminal as TerminalIcon, AlertCircle } from "lucide-react";
import { Terminal } from "../terminal/Terminal";
import { ensurePty, type PtyInfo } from "../../lib/api";
import type { TerminalViewProps } from "./types";

export function TerminalView({ session }: TerminalViewProps) {
  const [ptyInfo, setPtyInfo] = useState<PtyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Track which session we've initialized
  const initializedSessionRef = useRef<string | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Initialize PTY when session changes
  const initializePty = useCallback(async (sessionId: string) => {
    if (initializedSessionRef.current === sessionId) {
      return;
    }

    setIsLoading(true);
    setError(null);
    initializedSessionRef.current = sessionId;

    try {
      const info = await ensurePty(sessionId);
      setPtyInfo(info);
      retryCountRef.current = 0;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create terminal";
      console.error("[TerminalView] Failed to initialize PTY:", errorMessage);

      // Auto-retry on "Session not found"
      if (errorMessage.includes("Session not found") && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log(`[TerminalView] Session not found, retrying (${retryCountRef.current}/${maxRetries})...`);
        initializedSessionRef.current = null;
        setTimeout(() => {
          initializePty(sessionId);
        }, 1000);
        return;
      }

      setError(errorMessage);
      initializedSessionRef.current = null;
      retryCountRef.current = 0;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const currentSessionId = session?.sessionId ?? null;
    const sessionChanged = currentSessionId !== prevSessionIdRef.current;
    prevSessionIdRef.current = currentSessionId;

    if (session) {
      if (sessionChanged && initializedSessionRef.current !== session.sessionId) {
        setPtyInfo(null);
        setIsConnected(false);
        setError(null);
        initializedSessionRef.current = null;
      }
      initializePty(session.sessionId);
    } else {
      setPtyInfo(null);
      setIsLoading(false);
      setError(null);
      setIsConnected(false);
      initializedSessionRef.current = null;
    }
  }, [session?.sessionId, initializePty]);

  // Empty state
  if (!session) {
    return (
      <main className="terminal-view">
        <div className="terminal-view__empty">
          <TerminalIcon className="terminal-view__empty-icon" />
          <div className="terminal-view__empty-text">No agent selected</div>
          <div className="terminal-view__empty-hint">
            Click an agent in the sidebar to connect
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="terminal-view">
      {/* Terminal Area */}
      <div className="terminal-view__content">
        {isLoading ? (
          <div className="terminal-view__empty">
            <div className="terminal-view__empty-text">Connecting to terminal...</div>
          </div>
        ) : error ? (
          <div className="terminal-view__empty">
            <AlertCircle className="terminal-view__empty-icon terminal-view__empty-icon--error" />
            <div className="terminal-view__empty-text terminal-view__empty-text--error">
              {error}
            </div>
            <button
              className="terminal-view__retry-btn"
              onClick={() => {
                initializedSessionRef.current = null;
                if (session) initializePty(session.sessionId);
              }}
            >
              Retry
            </button>
          </div>
        ) : ptyInfo ? (
          <Terminal
            key={session.sessionId}
            wsUrl={ptyInfo.wsUrl}
            wsToken={ptyInfo.wsToken}
            onConnect={() => setIsConnected(true)}
            onDisconnect={() => setIsConnected(false)}
            onError={(err) => setError(err)}
            onTerminalError={(err) => setError(err)}
          />
        ) : (
          <div className="terminal-view__empty">
            <div className="terminal-view__empty-text">No terminal available</div>
          </div>
        )}
      </div>
    </main>
  );
}
