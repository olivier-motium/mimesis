/**
 * Viewport - Center terminal area (Zone B)
 *
 * Shows the terminal for the selected agent with a HUD overlay
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Terminal as TerminalIcon, Command, AlertCircle } from "lucide-react";
import { Terminal } from "../terminal/Terminal";
import { ensurePty, sendText, type PtyInfo } from "../../lib/api";
import { getEffectiveStatus } from "../../lib/sessionStatus";
import { getGoalText, STATUS_LABELS } from "./constants";
import type { ViewportProps } from "./types";

export function Viewport({ session, onSendCommand }: ViewportProps) {
  const [ptyInfo, setPtyInfo] = useState<PtyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // Track which session we've initialized (by sessionId, not workChainId)
  // This allows PTY to reconnect seamlessly when compaction changes the sessionId
  const initializedSessionRef = useRef<string | null>(null);

  // Track retry attempts
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
      // Single API call - daemon handles get-or-create
      const info = await ensurePty(sessionId);
      setPtyInfo(info);
      retryCountRef.current = 0; // Reset retry count on success
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create terminal";
      console.error("[Viewport] Failed to initialize PTY:", errorMessage);

      // Auto-retry on "Session not found" (race condition - session may still be loading)
      if (errorMessage.includes("Session not found") && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log(`[Viewport] Session not found, retrying (${retryCountRef.current}/${maxRetries})...`);
        initializedSessionRef.current = null;
        // Retry after a short delay
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
    if (session) {
      initializePty(session.sessionId);
    } else {
      setPtyInfo(null);
      setIsLoading(false);
      setError(null);
      setIsConnected(false);
      initializedSessionRef.current = null;
    }
  }, [session?.sessionId, initializePty]);

  // Handle command input
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !session) return;

    try {
      await sendText(session.sessionId, inputValue, true);
      setInputValue("");
      onSendCommand(inputValue);
    } catch (err) {
      console.error("[Viewport] Failed to send command:", err);
    }
  };

  // Empty state
  if (!session) {
    return (
      <main className="fleet-viewport">
        <div className="fleet-viewport__empty">
          <TerminalIcon className="fleet-viewport__empty-icon" />
          <div className="fleet-viewport__empty-text">No agent selected</div>
          <div className="fleet-viewport__empty-hint">
            Click an agent in the roster to connect
          </div>
        </div>
      </main>
    );
  }

  const { status } = getEffectiveStatus(session);
  const goal = getGoalText(session);

  return (
    <main className="fleet-viewport">
      {/* HUD Overlay */}
      <div className="fleet-viewport__hud">
        <div className="fleet-viewport__hud-content">
          <div className="fleet-viewport__hud-label">Current Mission Objective</div>
          <div className="fleet-viewport__hud-goal">{goal}</div>
        </div>
        <div className="fleet-viewport__hud-meta">
          <span className={`fleet-viewport__status-badge fleet-viewport__status-badge--${status}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {/* Terminal Area */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {isLoading ? (
          <div className="fleet-viewport__empty">
            <div className="fleet-viewport__empty-text">Connecting to terminal...</div>
          </div>
        ) : error ? (
          <div className="fleet-viewport__empty">
            <AlertCircle className="fleet-viewport__empty-icon" style={{ color: "var(--nb-red)" }} />
            <div className="fleet-viewport__empty-text" style={{ color: "var(--nb-red)" }}>
              {error}
            </div>
            <button
              onClick={() => {
                initializedSessionRef.current = null;
                if (session) initializePty(session.sessionId);
              }}
              style={{
                marginTop: 8,
                padding: "8px 16px",
                background: "var(--nb-sidebar)",
                border: "1px solid var(--nb-border)",
                borderRadius: 4,
                color: "var(--nb-text)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Retry
            </button>
          </div>
        ) : ptyInfo ? (
          <Terminal
            wsUrl={ptyInfo.wsUrl}
            wsToken={ptyInfo.wsToken}
            onConnect={() => setIsConnected(true)}
            onDisconnect={() => setIsConnected(false)}
            onError={(err) => setError(err)}
            onTerminalError={(err) => setError(err)}
          />
        ) : (
          <div className="fleet-viewport__empty">
            <div className="fleet-viewport__empty-text">No terminal available</div>
          </div>
        )}
      </div>

      {/* Command Input */}
      <div className="fleet-viewport__input">
        <form onSubmit={handleSubmit} className="fleet-viewport__input-wrapper">
          <div className="fleet-viewport__input-icon">
            <Command size={14} />
          </div>
          <input
            type="text"
            className="fleet-viewport__input-field"
            placeholder={`Send command to ${session.gitBranch || "agent"}...`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <span className="fleet-viewport__input-hint">ENTER</span>
        </form>
      </div>
    </main>
  );
}
