/**
 * Gateway connection manager - Singleton WebSocket connection to fleet gateway.
 *
 * Features:
 * - Survives HMR and React Strict Mode double-mounting
 * - Automatic reconnection with exponential backoff
 * - Message pub/sub for multiple subscribers
 * - Status change notifications
 */

import { config } from "../config";
import type { GatewayStatus } from "./gateway-types";

// Gateway config (from centralized config)
const GATEWAY_URL = config.gateway.wsUrl;
const RECONNECT_DELAY_MS = config.gateway.reconnectDelayMs;
const MAX_RECONNECT_ATTEMPTS = config.gateway.maxReconnectAttempts;

// ============================================================================
// Connection Manager Interface
// ============================================================================

interface ConnectionManager {
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  subscribers: Set<(message: Record<string, unknown>) => void>;
  statusListeners: Set<(status: GatewayStatus) => void>;
  lastStatus: GatewayStatus;
}

// Type augmentation for globalThis (proper typing instead of double cast)
declare global {
  // eslint-disable-next-line no-var
  var __gatewayManager: ConnectionManager | undefined;
}

// ============================================================================
// Singleton Instance
// ============================================================================

// Global singleton that survives HMR
const connectionManager: ConnectionManager = globalThis.__gatewayManager ?? {
  ws: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  subscribers: new Set(),
  statusListeners: new Set(),
  lastStatus: "disconnected",
};
globalThis.__gatewayManager = connectionManager;

// ============================================================================
// Internal Functions
// ============================================================================

function notifyStatus(status: GatewayStatus): void {
  connectionManager.lastStatus = status;
  connectionManager.statusListeners.forEach((listener) => listener(status));
}

function notifyMessage(message: Record<string, unknown>): void {
  connectionManager.subscribers.forEach((subscriber) => subscriber(message));
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Connect to the gateway WebSocket server.
 * Safe to call multiple times - will only connect if not already connected.
 */
export function connectGateway(fromEventId: number): void {
  // Don't connect if already connected or connecting
  if (
    connectionManager.ws?.readyState === WebSocket.OPEN ||
    connectionManager.ws?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  notifyStatus("connecting");

  const ws = new WebSocket(GATEWAY_URL);
  connectionManager.ws = ws;

  ws.onopen = () => {
    notifyStatus("connected");
    connectionManager.reconnectAttempts = 0;

    // Subscribe to fleet events
    ws.send(
      JSON.stringify({
        type: "fleet.subscribe",
        from_event_id: fromEventId,
      })
    );

    // Request session list (v5.2 - unified session store)
    ws.send(
      JSON.stringify({
        type: "sessions.list",
      })
    );
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      notifyMessage(message);
    } catch {
      // Message parse errors are non-fatal
    }
  };

  ws.onerror = () => {
    // WebSocket errors trigger onclose, no separate handling needed
  };

  ws.onclose = () => {
    notifyStatus("disconnected");
    connectionManager.ws = null;

    // Only reconnect if there are subscribers
    if (connectionManager.subscribers.size === 0) {
      return;
    }

    // Attempt reconnect
    if (connectionManager.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      connectionManager.reconnectAttempts++;
      const delay =
        RECONNECT_DELAY_MS * Math.min(connectionManager.reconnectAttempts, 5);
      connectionManager.reconnectTimer = setTimeout(
        () => connectGateway(fromEventId),
        delay
      );
    }
  };
}

/**
 * Send a message to the gateway.
 * No-op if not connected.
 */
export function sendGatewayMessage(message: Record<string, unknown>): void {
  if (connectionManager.ws?.readyState === WebSocket.OPEN) {
    connectionManager.ws.send(JSON.stringify(message));
  }
}

/**
 * Subscribe to gateway messages.
 * Returns unsubscribe function.
 */
export function subscribeToMessages(
  callback: (message: Record<string, unknown>) => void
): () => void {
  connectionManager.subscribers.add(callback);
  return () => {
    connectionManager.subscribers.delete(callback);
  };
}

/**
 * Subscribe to connection status changes.
 * Returns unsubscribe function.
 */
export function subscribeToStatus(
  callback: (status: GatewayStatus) => void
): () => void {
  connectionManager.statusListeners.add(callback);
  return () => {
    connectionManager.statusListeners.delete(callback);
  };
}

/**
 * Get the current connection status.
 */
export function getConnectionStatus(): GatewayStatus {
  return connectionManager.lastStatus;
}

/**
 * Check if currently connected.
 */
export function isConnected(): boolean {
  return connectionManager.ws?.readyState === WebSocket.OPEN;
}

/**
 * Send a ping message for heartbeat.
 */
export function sendPing(): void {
  if (connectionManager.ws?.readyState === WebSocket.OPEN) {
    connectionManager.ws.send(JSON.stringify({ type: "ping" }));
  }
}
