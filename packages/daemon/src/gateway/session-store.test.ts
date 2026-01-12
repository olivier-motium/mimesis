/**
 * Session Store Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SessionStore,
  type WatcherSessionData,
  type PtySessionData,
} from "./session-store.js";
import type { StatusResult } from "../types.js";

// Helper to create valid StatusResult
function createStatus(
  status: "working" | "waiting" | "idle",
  lastActivityAt = "2024-01-01T00:00:00Z"
): StatusResult {
  return {
    status,
    lastRole: "assistant",
    hasPendingToolUse: false,
    lastActivityAt,
    messageCount: 1,
  };
}

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  describe("addFromWatcher", () => {
    it("adds new session from watcher", () => {
      const data: WatcherSessionData = {
        sessionId: "session-1",
        cwd: "/home/user/project",
        status: createStatus("working"),
        gitBranch: "main",
        gitRepoUrl: "https://github.com/user/repo",
        originalPrompt: "Hello world",
      };

      store.addFromWatcher(data);

      const session = store.get("session-1");
      expect(session).toBeDefined();
      expect(session?.sessionId).toBe("session-1");
      expect(session?.cwd).toBe("/home/user/project");
      expect(session?.status).toBe("working");
      expect(session?.source).toBe("watcher");
      expect(session?.gitBranch).toBe("main");
      expect(session?.originalPrompt).toBe("Hello world");
    });

    it("emits discovered event for new session", () => {
      const listener = vi.fn();
      store.subscribe(listener);

      const data: WatcherSessionData = {
        sessionId: "session-1",
        cwd: "/home/user/project",
        status: createStatus("idle"),
      };

      store.addFromWatcher(data);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "discovered",
          session: expect.objectContaining({ sessionId: "session-1" }),
        })
      );
    });

    it("emits updated event for existing session", () => {
      const data: WatcherSessionData = {
        sessionId: "session-1",
        cwd: "/home/user/project",
        status: createStatus("idle"),
      };

      store.addFromWatcher(data);

      const listener = vi.fn();
      store.subscribe(listener);

      const updatedData: WatcherSessionData = {
        sessionId: "session-1",
        cwd: "/home/user/project",
        status: createStatus("working", "2024-01-01T00:01:00Z"),
      };

      store.addFromWatcher(updatedData);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "updated",
          sessionId: "session-1",
        })
      );
    });

    it("maps status correctly", () => {
      const testCases: Array<{
        input: "working" | "waiting" | "idle";
        expected: "working" | "waiting" | "idle";
      }> = [
        { input: "working", expected: "working" },
        { input: "waiting", expected: "waiting" },
        { input: "idle", expected: "idle" },
      ];

      for (const { input, expected } of testCases) {
        store.addFromWatcher({
          sessionId: `session-${input}`,
          cwd: "/test",
          status: createStatus(input),
        });

        const session = store.get(`session-${input}`);
        expect(session?.status).toBe(expected);
      }
    });
  });

  describe("addFromPty", () => {
    it("adds new session from PTY", () => {
      const data: PtySessionData = {
        sessionId: "pty-session-1",
        projectId: "project-1",
        cwd: "/home/user/project",
        pid: 12345,
      };

      store.addFromPty(data);

      const session = store.get("pty-session-1");
      expect(session).toBeDefined();
      expect(session?.sessionId).toBe("pty-session-1");
      expect(session?.projectId).toBe("project-1");
      expect(session?.source).toBe("pty");
      expect(session?.status).toBe("working");
      expect(session?.pid).toBe(12345);
    });

    it("preserves watcher data when upgrading to PTY", () => {
      // First add from watcher
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
        gitBranch: "feature-branch",
        originalPrompt: "Original prompt",
      });

      // Then add from PTY (same session)
      store.addFromPty({
        sessionId: "session-1",
        projectId: "project-1",
        cwd: "/test",
        pid: 12345,
      });

      const session = store.get("session-1");
      expect(session?.source).toBe("pty");
      expect(session?.gitBranch).toBe("feature-branch");
      expect(session?.originalPrompt).toBe("Original prompt");
      expect(session?.pid).toBe(12345);
    });
  });

  describe("updateFileStatus", () => {
    it("updates session file status", () => {
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      store.updateFileStatus("session-1", {
        status: "working",
        updated: "2024-01-01T00:00:00Z",
        task: "Running tests",
        summary: "Test summary",
      });

      const session = store.get("session-1");
      expect(session?.fileStatus?.task).toBe("Running tests");
      expect(session?.fileStatus?.summary).toBe("Test summary");
    });

    it("maps file status to UI status", () => {
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      store.updateFileStatus("session-1", {
        status: "waiting_for_approval",
        updated: "2024-01-01T00:00:00Z",
        task: "Waiting",
      });

      const session = store.get("session-1");
      expect(session?.status).toBe("waiting");
    });

    it("emits updated event", () => {
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      const listener = vi.fn();
      store.subscribe(listener);

      store.updateFileStatus("session-1", {
        status: "working",
        updated: "2024-01-01T00:00:00Z",
        task: "Task",
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "updated",
          sessionId: "session-1",
          updates: expect.objectContaining({
            fileStatus: expect.objectContaining({ task: "Task" }),
          }),
        })
      );
    });

    it("ignores update for non-existent session", () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.updateFileStatus("non-existent", {
        status: "working",
        updated: "2024-01-01T00:00:00Z",
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("updateStatus", () => {
    it("updates session UI status", () => {
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      store.updateStatus("session-1", "working");

      const session = store.get("session-1");
      expect(session?.status).toBe("working");
    });

    it("updates lastActivityAt", () => {
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      const before = store.get("session-1")?.lastActivityAt;

      store.updateStatus("session-1", "working");

      const after = store.get("session-1")?.lastActivityAt;
      expect(after).not.toBe(before);
    });
  });

  describe("remove", () => {
    it("removes session from store", () => {
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      store.remove("session-1");

      expect(store.get("session-1")).toBeUndefined();
    });

    it("emits removed event", () => {
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      const listener = vi.fn();
      store.subscribe(listener);

      store.remove("session-1");

      expect(listener).toHaveBeenCalledWith({
        type: "removed",
        sessionId: "session-1",
      });
    });

    it("ignores removal of non-existent session", () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.remove("non-existent");

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("getAll", () => {
    it("returns all sessions", () => {
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });
      store.addFromWatcher({
        sessionId: "session-2",
        cwd: "/test",
        status: createStatus("working"),
      });
      store.addFromPty({
        sessionId: "pty-session",
        projectId: "project",
        cwd: "/test",
        pid: 123,
      });

      const sessions = store.getAll();
      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.sessionId)).toContain("session-1");
      expect(sessions.map((s) => s.sessionId)).toContain("session-2");
      expect(sessions.map((s) => s.sessionId)).toContain("pty-session");
    });
  });

  describe("subscribe", () => {
    it("returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      store.addFromWatcher({
        sessionId: "session-2",
        cwd: "/test",
        status: createStatus("idle"),
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("handles listener errors gracefully", () => {
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const normalListener = vi.fn();

      store.subscribe(errorListener);
      store.subscribe(normalListener);

      // Should not throw
      store.addFromWatcher({
        sessionId: "session-1",
        cwd: "/test",
        status: createStatus("idle"),
      });

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });
});
