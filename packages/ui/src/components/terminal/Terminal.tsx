/**
 * Terminal component - xterm.js wrapper with WebSocket connection.
 *
 * Connects to PTY via WebSocket for real-time terminal I/O.
 */

import { useEffect, useRef, useMemo } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { radixDarkTheme, terminalStyles } from "./theme";

/** Debounce utility to prevent rapid successive calls */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

/** Known error patterns from Claude CLI output */
const TERMINAL_ERROR_PATTERNS = [
  { pattern: /No conversation found with session ID/i, message: "Session not found - it may have been compacted or cleared" },
  { pattern: /Session .+ not found/i, message: "Session not found - it may have been compacted or cleared" },
  { pattern: /Error: Could not resume/i, message: "Unable to resume this session" },
] as const;

/** Segment info for displaying rotation markers */
export interface SegmentInfo {
  sessionId: string;
  reason: "startup" | "resume" | "compact" | "clear";
  trigger?: "auto" | "manual";
  startedAt: string;
}

export interface TerminalProps {
  /** WebSocket URL for PTY connection */
  wsUrl: string;
  /** Authentication token for WebSocket */
  wsToken: string;
  /** Called when WebSocket connects successfully */
  onConnect?: () => void;
  /** Called when WebSocket disconnects */
  onDisconnect?: () => void;
  /** Called when terminal is resized */
  onResize?: (cols: number, rows: number) => void;
  /** Called when connection error occurs */
  onError?: (error: string) => void;
  /** Called when terminal output contains a known error pattern */
  onTerminalError?: (error: string) => void;
  /** Current segment info (for segment markers) */
  segment?: SegmentInfo;
  /** Called when a segment rotation event is detected */
  onSegmentRotated?: (segment: SegmentInfo) => void;
}

interface WsMessage {
  type: "data" | "input" | "resize" | "ping" | "pong";
  payload?: string;
  cols?: number;
  rows?: number;
}

/**
 * Format a segment marker for display in terminal.
 */
function formatSegmentMarker(segment: SegmentInfo): string {
  const time = new Date(segment.startedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const reasonText = {
    startup: "Started",
    resume: "Resumed",
    compact: "Compacted",
    clear: "Cleared",
  }[segment.reason];

  const triggerSuffix = segment.trigger ? ` (${segment.trigger})` : "";

  return `\r\n\x1b[90m─── ${reasonText}${triggerSuffix} at ${time} ───\x1b[0m\r\n`;
}

/**
 * Embedded terminal component using xterm.js.
 */
export function Terminal({
  wsUrl,
  wsToken,
  onConnect,
  onDisconnect,
  onResize,
  onError,
  onTerminalError,
  segment,
  onSegmentRotated,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSegmentIdRef = useRef<string | null>(null);

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new XTerminal({
      theme: radixDarkTheme,
      fontFamily: terminalStyles.fontFamily,
      fontSize: terminalStyles.fontSize,
      lineHeight: terminalStyles.lineHeight,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);

    // Store refs before async operations
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    // Initial fit() will be triggered by ResizeObserver when container has dimensions

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Handle segment rotation markers
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !segment) return;

    // Check if segment changed (not just re-render)
    if (lastSegmentIdRef.current !== segment.sessionId) {
      // Skip marker for first segment (startup) - just track it
      if (lastSegmentIdRef.current !== null) {
        // Write segment marker to terminal
        terminal.write(formatSegmentMarker(segment));

        // Notify parent of segment rotation
        onSegmentRotated?.(segment);
      }

      lastSegmentIdRef.current = segment.sessionId;
    }
  }, [segment, onSegmentRotated]);

  // Connect WebSocket
  // Uses an abort flag to handle React StrictMode double-mounting gracefully
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    // Abort flag to prevent callbacks after unmount (handles StrictMode)
    let aborted = false;

    const wsUrlWithToken = `${wsUrl}?token=${wsToken}`;
    console.log("[Terminal] Connecting to WebSocket:", wsUrlWithToken);
    const ws = new WebSocket(wsUrlWithToken);

    ws.onopen = () => {
      if (aborted) {
        // Component unmounted during connection - close silently
        console.log("[Terminal] WebSocket opened but component unmounted, closing");
        ws.close(1000, "Component unmounted");
        return;
      }
      console.log("[Terminal] WebSocket connected");
      onConnect?.();

      // Delay initial resize until after fit() has run
      // This ensures we send correct dimensions to the PTY
      requestAnimationFrame(() => {
        if (!aborted && fitAddonRef.current && terminalRef.current && ws.readyState === WebSocket.OPEN) {
          fitAddonRef.current.fit();
          const { cols, rows } = terminalRef.current;
          const msg: WsMessage = { type: "resize", cols, rows };
          ws.send(JSON.stringify(msg));
        }
      });
    };

    ws.onmessage = (event) => {
      if (aborted) return;
      try {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type === "data" && msg.payload) {
          terminal.write(msg.payload);

          // Check for known error patterns in output
          if (onTerminalError) {
            for (const { pattern, message } of TERMINAL_ERROR_PATTERNS) {
              if (pattern.test(msg.payload)) {
                onTerminalError(message);
                break;
              }
            }
          }
        }
      } catch {
        // Binary data or invalid JSON - write directly
        terminal.write(event.data);
      }
    };

    ws.onclose = (event) => {
      if (aborted) return; // Ignore close events after unmount
      console.log("[Terminal] WebSocket closed:", event.code, event.reason);
      onDisconnect?.();
    };

    ws.onerror = () => {
      if (aborted) return; // Ignore error events after unmount
      console.error("[Terminal] WebSocket error");
      onError?.("WebSocket connection failed");
    };

    wsRef.current = ws;

    // Send input to PTY
    const inputDisposable = terminal.onData((data) => {
      if (!aborted && ws.readyState === WebSocket.OPEN) {
        const msg: WsMessage = { type: "input", payload: data };
        ws.send(JSON.stringify(msg));
      }
    });

    return () => {
      aborted = true; // Mark as aborted first
      inputDisposable.dispose();
      // Close WebSocket in any active state (CONNECTING or OPEN)
      if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        ws.close(1000, "Component unmounting");
      }
      wsRef.current = null;
    };
  }, [wsUrl, wsToken, onConnect, onDisconnect, onError, onTerminalError]);

  // Debounced resize handler to prevent rapid successive fit() calls
  // This fixes flickering caused by ResizeObserver firing multiple times
  const handleResize = useMemo(
    () =>
      debounce(() => {
        const terminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;
        const ws = wsRef.current;

        if (!terminal || !fitAddon) return;

        fitAddon.fit();
        const { cols, rows } = terminal;

        // Notify server
        if (ws?.readyState === WebSocket.OPEN) {
          const msg: WsMessage = { type: "resize", cols, rows };
          ws.send(JSON.stringify(msg));
        }

        onResize?.(cols, rows);
      }, 100), // 100ms debounce - imperceptible to users
    [onResize]
  );

  // Resize on window resize
  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  // Resize when container size changes (for layout changes)
  // ResizeObserver handles both initial sizing and subsequent resizes
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(containerRef.current);

    // Note: ResizeObserver fires on initial observation when element has dimensions
    // No need for extra RAF trigger - it causes duplicate fit() calls

    return () => resizeObserver.disconnect();
  }, [handleResize]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-2"
      style={{ backgroundColor: radixDarkTheme.background }}
    />
  );
}
