/**
 * UI Configuration - Centralized config for all UI services.
 *
 * Environment variables (set in .env):
 * - VITE_GATEWAY_WS_URL: WebSocket URL for gateway (default: ws://<hostname>:4452)
 * - VITE_API_BASE_URL: REST API base URL (default: http://<hostname>:4451/api)
 *
 * By default, URLs use window.location.hostname to support remote/Docker deployments.
 */

/** Get the default hostname for URLs (browser hostname or localhost for SSR) */
function getDefaultHost(): string {
  return typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
}

export const config = {
  /**
   * Gateway WebSocket configuration
   */
  gateway: {
    /** WebSocket URL for the gateway server */
    wsUrl: import.meta.env.VITE_GATEWAY_WS_URL ?? `ws://${getDefaultHost()}:4452`,
    /** Delay before reconnection attempts (ms) */
    reconnectDelayMs: 2000,
    /** Maximum reconnection attempts before giving up */
    maxReconnectAttempts: 10,
  },

  /**
   * Event buffer limits - prevent unbounded memory growth
   */
  events: {
    /** Maximum fleet events to keep in memory (oldest evicted first) */
    maxFleetEvents: 1000,
    /** Maximum session events per session (oldest evicted first) */
    maxSessionEvents: 5000,
  },

  /**
   * REST API configuration
   */
  api: {
    /** Base URL for REST API calls */
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? `http://${getDefaultHost()}:4451/api`,
  },
} as const;

export type Config = typeof config;
