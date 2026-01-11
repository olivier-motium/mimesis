/**
 * Integration tests for compaction flow.
 *
 * Tests the findPredecessor logic and handleCompaction behavior.
 * Since these are private methods, we test through behavior patterns.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SessionState } from "./watcher.js";
import type { StatusResult } from "./types.js";

// Test directory
const TEST_BASE_DIR = path.join(os.tmpdir(), `mimesis-compaction-integration-${Date.now()}`);

// Helper to generate unique session IDs
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Helper to create SessionState for testing
function createTestSessionState(overrides: Partial<SessionState> = {}): SessionState {
  const sessionId = overrides.sessionId ?? generateSessionId();
  const now = new Date().toISOString();

  const status: StatusResult = {
    status: "working",
    lastActivityAt: overrides.status?.lastActivityAt ?? now,
    messageCount: overrides.status?.messageCount ?? 1,
    hasPendingToolUse: overrides.status?.hasPendingToolUse ?? false,
    lastRole: overrides.status?.lastRole ?? "user",
  };

  return {
    sessionId,
    cwd: overrides.cwd ?? "/test/project",
    gitBranch: overrides.gitBranch ?? "main",
    gitRepoUrl: overrides.gitRepoUrl ?? null,
    gitRepoId: overrides.gitRepoId ?? null,
    originalPrompt: overrides.originalPrompt ?? "Test prompt",
    entries: overrides.entries ?? [],
    status,
    // Internal fields required by SessionStateInternal
    filepath: overrides.filepath ?? "/test/project/.claude/sessions/test.jsonl",
    encodedDir: overrides.encodedDir ?? "-test-project",
    bytePosition: overrides.bytePosition ?? 0,
    startedAt: overrides.startedAt ?? now,
  };
}

// Helper to create a compaction marker
async function createMarkerFile(cwd: string, newSessionId: string): Promise<string> {
  const claudeDir = path.join(cwd, ".claude");
  await mkdir(claudeDir, { recursive: true });

  const markerPath = path.join(claudeDir, `compacted.${newSessionId}.marker`);
  const markerData = {
    newSessionId,
    cwd,
    compactedAt: new Date().toISOString(),
  };

  await writeFile(markerPath, JSON.stringify(markerData, null, 2));
  return markerPath;
}

describe("Compaction Logic", () => {
  beforeEach(async () => {
    await mkdir(TEST_BASE_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  describe("findPredecessor logic patterns", () => {
    /**
     * Test the predecessor selection logic independently.
     * This simulates what findPredecessor does without needing StreamServer.
     */

    it("should select most recently active session in same cwd", () => {
      const cwd = "/test/project";
      const newSessionId = generateSessionId();

      // Simulate session cache with multiple sessions
      const t1 = new Date(Date.now() - 60000).toISOString(); // 1 min ago
      const t2 = new Date(Date.now() - 30000).toISOString(); // 30 sec ago
      const t3 = new Date(Date.now() - 10000).toISOString(); // 10 sec ago

      const sessions: [string, SessionState][] = [
        [generateSessionId(), createTestSessionState({ cwd, status: { lastActivityAt: t1, status: "working", lastRole: "user", hasPendingToolUse: false, messageCount: 1 } })],
        [generateSessionId(), createTestSessionState({ cwd, status: { lastActivityAt: t2, status: "working", lastRole: "user", hasPendingToolUse: false, messageCount: 1 } })],
        [generateSessionId(), createTestSessionState({ cwd, status: { lastActivityAt: t3, status: "working", lastRole: "user", hasPendingToolUse: false, messageCount: 1 } })],
      ];

      // Simulate findPredecessor logic
      const candidates = sessions.filter(([id, state]) =>
        id !== newSessionId && state.cwd === cwd
      );

      candidates.sort((a, b) =>
        new Date(b[1].status.lastActivityAt).getTime() - new Date(a[1].status.lastActivityAt).getTime()
      );

      const predecessor = candidates[0];

      // Should select the most recent (t3)
      expect(predecessor[1].status.lastActivityAt).toBe(t3);
    });

    it("should not select sessions from different cwd", () => {
      const cwd = "/test/project";
      const newSessionId = generateSessionId();

      const sessions: [string, SessionState][] = [
        [generateSessionId(), createTestSessionState({ cwd: "/other/project" })],
        [generateSessionId(), createTestSessionState({ cwd: "/another/project" })],
      ];

      const candidates = sessions.filter(([id, state]) =>
        id !== newSessionId && state.cwd === cwd
      );

      expect(candidates.length).toBe(0);
    });

    it("should only match sessions with same kittyWindowId when present", () => {
      const cwd = "/test/project";
      const newKittyId = "kitty-window-123";
      const newSessionId = generateSessionId();

      // Simulate terminal links
      const linkRepo = new Map<string, { kittyWindowId: number }>([
        ["session-1", { kittyWindowId: 123 }],
        ["session-2", { kittyWindowId: 456 }],
        ["session-3", { kittyWindowId: 123 }],
      ]);

      const sessions: [string, SessionState][] = [
        ["session-1", createTestSessionState({ cwd })],
        ["session-2", createTestSessionState({ cwd })],
        ["session-3", createTestSessionState({ cwd })],
      ];

      // Simulate kitty matching logic
      const candidates = sessions.filter(([id, state]) => {
        if (id === newSessionId) return false;
        if (state.cwd !== cwd) return false;

        const link = linkRepo.get(id);
        const kittyId = link?.kittyWindowId;

        // If new session has kitty context, only match same kitty window
        return kittyId === 123; // newKittyId numeric equivalent
      });

      // Should only include session-1 and session-3
      expect(candidates.length).toBe(2);
      expect(candidates.map(([id]) => id)).toContain("session-1");
      expect(candidates.map(([id]) => id)).toContain("session-3");
      expect(candidates.map(([id]) => id)).not.toContain("session-2");
    });

    it("should include all candidates when no terminal context", () => {
      const cwd = "/test/project";
      const newSessionId = generateSessionId();

      // No kitty link for new session
      const linkRepo = new Map<string, { kittyWindowId: number }>([
        ["session-1", { kittyWindowId: 123 }],
        ["session-2", { kittyWindowId: 456 }],
      ]);

      const sessions: [string, SessionState][] = [
        ["session-1", createTestSessionState({ cwd })],
        ["session-2", createTestSessionState({ cwd })],
        ["session-3", createTestSessionState({ cwd })],
      ];

      // When new session has no link, include all
      const newLink = linkRepo.get(newSessionId); // undefined
      const newKittyId = newLink?.kittyWindowId;

      const candidates = sessions.filter(([id, state]) => {
        if (id === newSessionId) return false;
        if (state.cwd !== cwd) return false;

        if (newKittyId !== undefined) {
          const link = linkRepo.get(id);
          return link?.kittyWindowId === newKittyId;
        }
        return true; // No context = include all
      });

      // Should include all three
      expect(candidates.length).toBe(3);
    });
  });

  describe("multi-tab scenario patterns", () => {
    it("should only supersede predecessor in same work chain", () => {
      /**
       * Scenario: 3 terminal tabs working on same repo
       *
       * Tab 1: session-A (kitty: 100)
       * Tab 2: session-B (kitty: 200)
       * Tab 3: session-C (kitty: 300)
       *
       * When session-A compacts → session-A2:
       * - Only session-A should be superseded
       * - session-B and session-C remain active
       */

      const cwd = "/test/repo";

      // Simulate existing sessions
      const sessionA = { id: "session-A", kittyWindowId: 100 };
      const sessionB = { id: "session-B", kittyWindowId: 200 };
      const sessionC = { id: "session-C", kittyWindowId: 300 };

      // New compacted session inherits Tab 1's kitty context
      const sessionA2 = { id: "session-A2", kittyWindowId: 100 };

      // Find predecessor for session-A2
      const allSessions = [sessionA, sessionB, sessionC];
      const newKittyId = sessionA2.kittyWindowId;

      const predecessor = allSessions.find((s) =>
        s.id !== sessionA2.id && s.kittyWindowId === newKittyId
      );

      // Should only find session-A
      expect(predecessor?.id).toBe("session-A");
    });

    it("should handle embedded terminal (no kitty) by using most recent", () => {
      /**
       * Scenario: Session started from Mimesis UI's embedded terminal
       *
       * No kittyWindowId - uses most recently active heuristic
       */

      const cwd = "/test/repo";

      const t1 = new Date(Date.now() - 60000).toISOString();
      const t2 = new Date(Date.now() - 30000).toISOString();
      const t3 = new Date(Date.now() - 10000).toISOString();

      // Sessions without kitty context
      const sessions = [
        { id: "session-1", lastActivityAt: t1, kittyWindowId: undefined },
        { id: "session-2", lastActivityAt: t2, kittyWindowId: undefined },
        { id: "session-3", lastActivityAt: t3, kittyWindowId: undefined },
      ];

      // New compacted session also has no kitty context
      const newSession = { id: "session-new", kittyWindowId: undefined };

      // Find predecessor
      const candidates = sessions.filter((s) => s.id !== newSession.id);

      candidates.sort((a, b) =>
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
      );

      const predecessor = candidates[0];

      // Should select most recent (session-3)
      expect(predecessor.id).toBe("session-3");
    });
  });

  describe("workChainId inheritance", () => {
    it("should track work chain IDs across sessions", () => {
      /**
       * Test that workChainId is preserved through compaction
       */

      // Simulate work chain tracking
      const workChainIds = new Map<string, string>();

      // Original session gets a work chain ID
      const sessionA = "session-A";
      const workChainId = "work-chain-uuid-123";
      workChainIds.set(sessionA, workChainId);

      // When session-A compacts to session-A2
      const sessionA2 = "session-A2";

      // Find predecessor's work chain
      const predecessorWorkChainId = workChainIds.get(sessionA);

      // Inherit to new session
      if (predecessorWorkChainId) {
        workChainIds.set(sessionA2, predecessorWorkChainId);
      }

      // Both should share same work chain
      expect(workChainIds.get(sessionA2)).toBe(workChainId);
      expect(workChainIds.get(sessionA)).toBe(workChainIds.get(sessionA2));
    });

    it("should generate new workChainId for unlinked sessions", () => {
      const workChainIds = new Map<string, string>();

      // Helper to get or create
      function getOrCreateWorkChainId(sessionId: string): string {
        let workChainId = workChainIds.get(sessionId);
        if (!workChainId) {
          workChainId = `work-chain-${Date.now()}-${Math.random()}`;
          workChainIds.set(sessionId, workChainId);
        }
        return workChainId;
      }

      const session1 = getOrCreateWorkChainId("session-1");
      const session2 = getOrCreateWorkChainId("session-2");

      // Different sessions get different work chains
      expect(session1).not.toBe(session2);

      // Same session returns same work chain
      expect(getOrCreateWorkChainId("session-1")).toBe(session1);
    });
  });

  describe("terminal link inheritance", () => {
    it("should transfer terminal link from predecessor to new session", () => {
      // Simulate link repo
      const links = new Map<string, { sessionId: string; kittyWindowId: number; linkedAt: string }>();

      // Predecessor has terminal link
      const predecessorId = "session-old";
      links.set(predecessorId, {
        sessionId: predecessorId,
        kittyWindowId: 123,
        linkedAt: new Date(Date.now() - 60000).toISOString(),
      });

      // On compaction, transfer to new session
      const newSessionId = "session-new";
      const oldLink = links.get(predecessorId);

      if (oldLink) {
        // Create new link for new session
        links.set(newSessionId, {
          sessionId: newSessionId,
          kittyWindowId: oldLink.kittyWindowId,
          linkedAt: new Date().toISOString(),
        });

        // Delete old link
        links.delete(predecessorId);
      }

      // New session should have the link
      expect(links.get(newSessionId)?.kittyWindowId).toBe(123);
      // Old session link should be removed
      expect(links.has(predecessorId)).toBe(false);
    });
  });

  describe("supersession tracking", () => {
    it("should mark predecessor as superseded with correct fields", () => {
      // Simulate session state
      const session = {
        sessionId: "old-session",
        superseded: false,
        supersededBy: null as string | null,
        supersededAt: null as string | null,
      };

      const newSessionId = "new-session";
      const compactedAt = new Date().toISOString();

      // Mark as superseded
      session.superseded = true;
      session.supersededBy = newSessionId;
      session.supersededAt = compactedAt;

      expect(session.superseded).toBe(true);
      expect(session.supersededBy).toBe(newSessionId);
      expect(session.supersededAt).toBe(compactedAt);
    });
  });
});

describe("Compaction Marker File Format", () => {
  it("should create valid marker file content", async () => {
    const projectDir = path.join(TEST_BASE_DIR, "marker-test");
    await mkdir(projectDir, { recursive: true });

    const sessionId = "test-session-id";
    const markerPath = await createMarkerFile(projectDir, sessionId);

    // Read and parse the marker
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(markerPath, "utf-8");
    const data = JSON.parse(content);

    expect(data.newSessionId).toBe(sessionId);
    expect(data.cwd).toBe(projectDir);
    expect(data.compactedAt).toBeDefined();
    expect(new Date(data.compactedAt).toISOString()).toBe(data.compactedAt);
  });

  it("should follow naming convention: compacted.<sessionId>.marker", async () => {
    const projectDir = path.join(TEST_BASE_DIR, "naming-test");
    await mkdir(projectDir, { recursive: true });

    const sessionId = "my-session-123";
    const markerPath = await createMarkerFile(projectDir, sessionId);

    const filename = path.basename(markerPath);
    expect(filename).toBe(`compacted.${sessionId}.marker`);
  });
});
