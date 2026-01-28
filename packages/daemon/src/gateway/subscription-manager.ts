/**
 * Subscription Manager - Manages client connection scopes and message routing.
 *
 * Controls which clients receive which messages based on their connection scope
 * and active subscriptions. Supports three scope levels and five message categories.
 */

import type { WebSocket } from "ws";

// =============================================================================
// Types
// =============================================================================

/** Connection scope determines the baseline message routing for a client. */
export type ConnectionScope = "global" | "session" | "observer";

/** Message category determines routing rules applied to outbound messages. */
export type MessageCategory = "lifecycle" | "fleet" | "session" | "commander" | "direct";

/**
 * Per-client subscription state.
 */
interface ClientSubscription {
  scope: ConnectionScope;
  subscribedSessions: Set<string>;
  fleetSubscribed: boolean;
  fleetCursor: number;
}

// =============================================================================
// SubscriptionManager
// =============================================================================

/**
 * Manages client subscriptions and determines message routing.
 *
 * Routing rules by category:
 * - lifecycle: all scopes receive
 * - fleet: only if fleetSubscribed is true
 * - session: global=always, session=only if subscribed to that sessionId, observer=never
 * - commander: global and session scopes, not observer
 * - direct: always returns false (handled explicitly, not through getRecipients)
 */
export class SubscriptionManager {
  private subscriptions = new Map<WebSocket, ClientSubscription>();

  /**
   * Register a new client with default global scope.
   */
  addClient(ws: WebSocket): void {
    this.subscriptions.set(ws, {
      scope: "global",
      subscribedSessions: new Set(),
      fleetSubscribed: false,
      fleetCursor: 0,
    });
  }

  /**
   * Remove a client and all its subscriptions.
   */
  removeClient(ws: WebSocket): void {
    this.subscriptions.delete(ws);
  }

  /**
   * Set the connection scope for a client.
   */
  setScope(ws: WebSocket, scope: ConnectionScope): void {
    const sub = this.subscriptions.get(ws);
    if (sub) {
      sub.scope = scope;
    }
  }

  /**
   * Subscribe a client to events for a specific session.
   */
  subscribeSession(ws: WebSocket, sessionId: string): void {
    const sub = this.subscriptions.get(ws);
    if (sub) {
      sub.subscribedSessions.add(sessionId);
    }
  }

  /**
   * Unsubscribe a client from events for a specific session.
   */
  unsubscribeSession(ws: WebSocket, sessionId: string): void {
    const sub = this.subscriptions.get(ws);
    if (sub) {
      sub.subscribedSessions.delete(sessionId);
    }
  }

  /**
   * Set fleet subscription state and cursor for a client.
   */
  setFleetSubscribed(ws: WebSocket, subscribed: boolean, cursor: number): void {
    const sub = this.subscriptions.get(ws);
    if (sub) {
      sub.fleetSubscribed = subscribed;
      sub.fleetCursor = cursor;
    }
  }

  /**
   * Get the fleet cursor for a client.
   */
  getFleetCursor(ws: WebSocket): number {
    const sub = this.subscriptions.get(ws);
    return sub?.fleetCursor ?? 0;
  }

  /**
   * Check if a client is subscribed to a specific session.
   */
  isSubscribedToSession(ws: WebSocket, sessionId: string): boolean {
    const sub = this.subscriptions.get(ws);
    if (!sub) return false;
    return sub.subscribedSessions.has(sessionId);
  }

  /**
   * Get all clients that should receive a message of the given category.
   *
   * @param category - The message category
   * @param sessionId - Required for "session" category to filter by subscription
   * @returns Array of WebSocket clients that should receive the message
   */
  getRecipients(category: MessageCategory, sessionId?: string): WebSocket[] {
    const recipients: WebSocket[] = [];

    for (const [ws, sub] of this.subscriptions) {
      if (this.shouldReceive(sub, category, sessionId)) {
        recipients.push(ws);
      }
    }

    return recipients;
  }

  /**
   * Get all connected client WebSockets.
   */
  getAllClients(): WebSocket[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Number of connected clients.
   */
  get size(): number {
    return this.subscriptions.size;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  /**
   * Determine if a client should receive a message based on its scope,
   * subscriptions, and the message category.
   */
  private shouldReceive(
    sub: ClientSubscription,
    category: MessageCategory,
    sessionId?: string
  ): boolean {
    switch (category) {
      case "lifecycle":
        // All scopes receive lifecycle messages
        return true;

      case "fleet":
        // Only clients with fleet subscription enabled
        return sub.fleetSubscribed;

      case "session":
        // global: always receives session events
        // session: only if subscribed to the specific session
        // observer: never receives session events
        switch (sub.scope) {
          case "global":
            return true;
          case "session":
            return sessionId !== undefined && sub.subscribedSessions.has(sessionId);
          case "observer":
            return false;
        }
        break;

      case "commander":
        // global and session scopes receive commander events, not observer
        return sub.scope === "global" || sub.scope === "session";

      case "direct":
        // Direct messages are never routed through getRecipients
        return false;
    }

    return false;
  }
}
