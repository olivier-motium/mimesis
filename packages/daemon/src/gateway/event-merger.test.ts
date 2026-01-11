/**
 * Event Merger Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EventMerger, EventMergerManager } from "./event-merger.js";
import { RingBuffer, RingBufferManager } from "./ring-buffer.js";
import type { HookEvent } from "./protocol.js";

describe("EventMerger", () => {
  let buffer: RingBuffer;
  let merger: EventMerger;

  beforeEach(() => {
    buffer = new RingBuffer(10 * 1024); // 10KB
    merger = new EventMerger(buffer);
  });

  it("assigns monotonic sequence numbers", () => {
    const seq1 = merger.addStdout("Hello");
    const seq2 = merger.addStdout("World");

    expect(seq1).toBe(1);
    expect(seq2).toBe(2);
    expect(merger.getLatestSeq()).toBe(2);
  });

  it("merges stdout and hook events in order", () => {
    merger.addStdout("Output 1");

    const hookEvent: HookEvent = {
      fleet_session_id: "test",
      hook_type: "PostToolUse",
      tool_name: "bash",
      tool_result: { success: true },
      phase: "post",
    };
    merger.addHookEvent(hookEvent);

    merger.addStdout("Output 2");

    const events = merger.getEventsFrom(0);
    expect(events.length).toBe(3);
    expect(events[0].event.type).toBe("stdout");
    expect(events[1].event.type).toBe("tool");
    expect(events[2].event.type).toBe("stdout");
  });

  it("tracks active tool state (pre/post phases)", () => {
    expect(merger.getActiveTool()).toBeNull();

    // Pre event starts tool
    const preHook: HookEvent = {
      fleet_session_id: "test",
      hook_type: "PreToolUse",
      tool_name: "bash",
      phase: "pre",
    };
    merger.addHookEvent(preHook);

    const activeTool = merger.getActiveTool();
    expect(activeTool).not.toBeNull();
    expect(activeTool?.toolName).toBe("bash");

    // Post event ends tool
    const postHook: HookEvent = {
      fleet_session_id: "test",
      hook_type: "PostToolUse",
      tool_name: "bash",
      phase: "post",
    };
    merger.addHookEvent(postHook);

    expect(merger.getActiveTool()).toBeNull();
  });

  it("transforms hook events to SessionEvent types", () => {
    const toolHook: HookEvent = {
      fleet_session_id: "test",
      hook_type: "PostToolUse",
      tool_name: "Read",
      tool_input: { path: "/file.txt" },
      tool_result: "file contents",
      ok: true,
      phase: "post",
    };
    merger.addHookEvent(toolHook);

    const events = merger.getEventsFrom(0);
    expect(events.length).toBe(1);

    const event = events[0].event;
    expect(event.type).toBe("tool");
    if (event.type === "tool") {
      expect(event.tool_name).toBe("Read");
      expect(event.tool_input).toEqual({ path: "/file.txt" });
      expect(event.ok).toBe(true);
      expect(event.phase).toBe("post");
    }
  });

  it("handles status change events", () => {
    const statusHook: HookEvent = {
      fleet_session_id: "test",
      hook_type: "StatusChange",
      event_type: "status_change",
      tool_input: "idle",
      tool_result: "working",
    };
    merger.addHookEvent(statusHook);

    const events = merger.getEventsFrom(0);
    expect(events.length).toBe(1);

    const event = events[0].event;
    expect(event.type).toBe("status_change");
  });

  it("ignores unknown hook types", () => {
    const unknownHook: HookEvent = {
      fleet_session_id: "test",
      hook_type: "UnknownType",
    };
    const seq = merger.addHookEvent(unknownHook);

    expect(seq).toBe(-1);
    expect(merger.getEventsFrom(0).length).toBe(0);
  });

  it("returns events from sequence number", () => {
    merger.addStdout("A");
    merger.addStdout("B");
    merger.addStdout("C");

    const events = merger.getEventsFrom(1);
    expect(events.length).toBe(2);
    expect(events[0].seq).toBe(2);
    expect(events[1].seq).toBe(3);
  });
});

describe("EventMergerManager", () => {
  let bufferManager: RingBufferManager;
  let mergerManager: EventMergerManager;

  beforeEach(() => {
    bufferManager = new RingBufferManager(10 * 1024);
    mergerManager = new EventMergerManager((sessionId) => bufferManager.getOrCreate(sessionId));
  });

  it("creates merger for new session", () => {
    const merger1 = mergerManager.getOrCreate("session-1");
    const merger2 = mergerManager.getOrCreate("session-2");

    expect(merger1).toBeDefined();
    expect(merger2).toBeDefined();
    expect(merger1).not.toBe(merger2);
  });

  it("returns same merger for existing session", () => {
    const merger1 = mergerManager.getOrCreate("session-1");
    merger1.addStdout("Test");

    const merger2 = mergerManager.getOrCreate("session-1");
    expect(merger2.getLatestSeq()).toBe(1);
  });

  it("removes session merger", () => {
    mergerManager.getOrCreate("session-1");
    expect(mergerManager.get("session-1")).toBeDefined();

    mergerManager.remove("session-1");
    expect(mergerManager.get("session-1")).toBeUndefined();
  });

  it("lists all sessions", () => {
    mergerManager.getOrCreate("session-a");
    mergerManager.getOrCreate("session-b");

    const sessions = mergerManager.getSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions).toContain("session-a");
    expect(sessions).toContain("session-b");
  });
});
