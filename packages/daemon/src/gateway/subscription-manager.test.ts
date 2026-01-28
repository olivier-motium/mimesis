/**
 * Subscription Manager Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SubscriptionManager } from "./subscription-manager.js";
import type { ConnectionScope, MessageCategory } from "./subscription-manager.js";
import type { WebSocket } from "ws";

/** Create a mock WebSocket object (minimal shape needed for Map keys). */
function createMockWs(): WebSocket {
  return { readyState: 1 } as unknown as WebSocket;
}

describe("SubscriptionManager", () => {
  let manager: SubscriptionManager;
  let ws1: WebSocket;
  let ws2: WebSocket;
  let ws3: WebSocket;

  beforeEach(() => {
    manager = new SubscriptionManager();
    ws1 = createMockWs();
    ws2 = createMockWs();
    ws3 = createMockWs();
  });

  // ===========================================================================
  // addClient / removeClient
  // ===========================================================================

  describe("addClient / removeClient", () => {
    it("tracks added clients", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      expect(manager.size).toBe(2);
    });

    it("removes clients", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      manager.removeClient(ws1);
      expect(manager.size).toBe(1);
    });

    it("removing a non-existent client is a no-op", () => {
      manager.addClient(ws1);
      manager.removeClient(ws2);
      expect(manager.size).toBe(1);
    });

    it("getAllClients returns all registered clients", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      const all = manager.getAllClients();
      expect(all).toHaveLength(2);
      expect(all).toContain(ws1);
      expect(all).toContain(ws2);
    });
  });

  // ===========================================================================
  // Default scope
  // ===========================================================================

  describe("default scope", () => {
    it("defaults to global scope on addClient", () => {
      manager.addClient(ws1);
      // global scope clients receive lifecycle, session, and commander messages
      const lifecycleRecipients = manager.getRecipients("lifecycle");
      expect(lifecycleRecipients).toContain(ws1);
      const sessionRecipients = manager.getRecipients("session", "any-session");
      expect(sessionRecipients).toContain(ws1);
      const commanderRecipients = manager.getRecipients("commander");
      expect(commanderRecipients).toContain(ws1);
    });
  });

  // ===========================================================================
  // lifecycle category
  // ===========================================================================

  describe("getRecipients('lifecycle')", () => {
    it("returns all clients regardless of scope", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      manager.addClient(ws3);
      manager.setScope(ws1, "global");
      manager.setScope(ws2, "session");
      manager.setScope(ws3, "observer");

      const recipients = manager.getRecipients("lifecycle");
      expect(recipients).toHaveLength(3);
      expect(recipients).toContain(ws1);
      expect(recipients).toContain(ws2);
      expect(recipients).toContain(ws3);
    });
  });

  // ===========================================================================
  // fleet category
  // ===========================================================================

  describe("getRecipients('fleet')", () => {
    it("returns only fleetSubscribed clients", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      manager.addClient(ws3);
      manager.setFleetSubscribed(ws1, true, 0);
      // ws2 and ws3 are not fleet-subscribed

      const recipients = manager.getRecipients("fleet");
      expect(recipients).toHaveLength(1);
      expect(recipients).toContain(ws1);
    });

    it("returns empty when no clients are fleet-subscribed", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      const recipients = manager.getRecipients("fleet");
      expect(recipients).toHaveLength(0);
    });

    it("respects unsubscribe (set to false)", () => {
      manager.addClient(ws1);
      manager.setFleetSubscribed(ws1, true, 0);
      manager.setFleetSubscribed(ws1, false, 0);
      const recipients = manager.getRecipients("fleet");
      expect(recipients).toHaveLength(0);
    });
  });

  // ===========================================================================
  // session category
  // ===========================================================================

  describe("getRecipients('session', sessionId)", () => {
    const sessionA = "session-a";
    const sessionB = "session-b";

    it("global scope: always receives session events", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "global");
      const recipients = manager.getRecipients("session", sessionA);
      expect(recipients).toContain(ws1);
    });

    it("session scope: only receives events for subscribed sessions", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "session");
      manager.subscribeSession(ws1, sessionA);

      expect(manager.getRecipients("session", sessionA)).toContain(ws1);
      expect(manager.getRecipients("session", sessionB)).not.toContain(ws1);
    });

    it("observer scope: never receives session events", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "observer");
      manager.subscribeSession(ws1, sessionA); // subscription doesn't matter for observer

      const recipients = manager.getRecipients("session", sessionA);
      expect(recipients).not.toContain(ws1);
    });

    it("mixed scopes route correctly", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      manager.addClient(ws3);
      manager.setScope(ws1, "global");
      manager.setScope(ws2, "session");
      manager.setScope(ws3, "observer");
      manager.subscribeSession(ws2, sessionA);

      const recipientsA = manager.getRecipients("session", sessionA);
      expect(recipientsA).toContain(ws1); // global
      expect(recipientsA).toContain(ws2); // session with subscription
      expect(recipientsA).not.toContain(ws3); // observer

      const recipientsB = manager.getRecipients("session", sessionB);
      expect(recipientsB).toContain(ws1); // global
      expect(recipientsB).not.toContain(ws2); // session without subscription
      expect(recipientsB).not.toContain(ws3); // observer
    });
  });

  // ===========================================================================
  // commander category
  // ===========================================================================

  describe("getRecipients('commander')", () => {
    it("returns global and session scoped clients, not observer", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      manager.addClient(ws3);
      manager.setScope(ws1, "global");
      manager.setScope(ws2, "session");
      manager.setScope(ws3, "observer");

      const recipients = manager.getRecipients("commander");
      expect(recipients).toContain(ws1);
      expect(recipients).toContain(ws2);
      expect(recipients).not.toContain(ws3);
    });
  });

  // ===========================================================================
  // direct category
  // ===========================================================================

  describe("getRecipients('direct')", () => {
    it("always returns empty (direct messages are routed explicitly)", () => {
      manager.addClient(ws1);
      manager.addClient(ws2);
      manager.setScope(ws1, "global");

      const recipients = manager.getRecipients("direct");
      expect(recipients).toHaveLength(0);
    });
  });

  // ===========================================================================
  // subscribeSession / unsubscribeSession
  // ===========================================================================

  describe("subscribeSession / unsubscribeSession", () => {
    it("subscribing adds session to tracked set", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "session");
      manager.subscribeSession(ws1, "s1");

      expect(manager.isSubscribedToSession(ws1, "s1")).toBe(true);
      expect(manager.isSubscribedToSession(ws1, "s2")).toBe(false);
    });

    it("unsubscribing removes session from tracked set", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "session");
      manager.subscribeSession(ws1, "s1");
      manager.unsubscribeSession(ws1, "s1");

      expect(manager.isSubscribedToSession(ws1, "s1")).toBe(false);
    });

    it("can subscribe to multiple sessions", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "session");
      manager.subscribeSession(ws1, "s1");
      manager.subscribeSession(ws1, "s2");
      manager.subscribeSession(ws1, "s3");

      expect(manager.isSubscribedToSession(ws1, "s1")).toBe(true);
      expect(manager.isSubscribedToSession(ws1, "s2")).toBe(true);
      expect(manager.isSubscribedToSession(ws1, "s3")).toBe(true);
    });

    it("unsubscribing one session does not affect others", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "session");
      manager.subscribeSession(ws1, "s1");
      manager.subscribeSession(ws1, "s2");
      manager.unsubscribeSession(ws1, "s1");

      expect(manager.isSubscribedToSession(ws1, "s1")).toBe(false);
      expect(manager.isSubscribedToSession(ws1, "s2")).toBe(true);
    });

    it("isSubscribedToSession returns false for unknown client", () => {
      expect(manager.isSubscribedToSession(ws1, "s1")).toBe(false);
    });
  });

  // ===========================================================================
  // setScope changes routing behavior
  // ===========================================================================

  describe("setScope changes routing behavior", () => {
    it("changing from global to observer stops session event delivery", () => {
      manager.addClient(ws1);
      // Global scope - receives all session events
      expect(manager.getRecipients("session", "s1")).toContain(ws1);

      // Switch to observer - no session events
      manager.setScope(ws1, "observer");
      expect(manager.getRecipients("session", "s1")).not.toContain(ws1);
    });

    it("changing from observer to session with subscription enables events", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "observer");
      expect(manager.getRecipients("session", "s1")).not.toContain(ws1);

      manager.setScope(ws1, "session");
      manager.subscribeSession(ws1, "s1");
      expect(manager.getRecipients("session", "s1")).toContain(ws1);
    });

    it("changing scope also affects commander routing", () => {
      manager.addClient(ws1);
      manager.setScope(ws1, "global");
      expect(manager.getRecipients("commander")).toContain(ws1);

      manager.setScope(ws1, "observer");
      expect(manager.getRecipients("commander")).not.toContain(ws1);
    });
  });

  // ===========================================================================
  // Fleet cursor
  // ===========================================================================

  describe("getFleetCursor", () => {
    it("returns the cursor set via setFleetSubscribed", () => {
      manager.addClient(ws1);
      manager.setFleetSubscribed(ws1, true, 42);
      expect(manager.getFleetCursor(ws1)).toBe(42);
    });

    it("returns 0 for unknown clients", () => {
      expect(manager.getFleetCursor(ws1)).toBe(0);
    });
  });
});
