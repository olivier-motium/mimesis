/**
 * Ring Buffer Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RingBuffer, RingBufferManager } from "./ring-buffer.js";
import type { SessionEvent, StdoutEvent } from "./protocol.js";

function createStdoutEvent(data: string): StdoutEvent {
  return {
    type: "stdout",
    data,
    timestamp: new Date().toISOString(),
  };
}

describe("RingBuffer", () => {
  let buffer: RingBuffer;

  beforeEach(() => {
    // 1KB buffer for testing
    buffer = new RingBuffer(1024);
  });

  it("assigns monotonic sequence numbers", () => {
    const seq1 = buffer.push(createStdoutEvent("Hello"));
    const seq2 = buffer.push(createStdoutEvent("World"));
    const seq3 = buffer.push(createStdoutEvent("!"));

    expect(seq1).toBe(1);
    expect(seq2).toBe(2);
    expect(seq3).toBe(3);
    expect(buffer.getLatestSeq()).toBe(3);
  });

  it("stores events up to size limit", () => {
    // Push many small events
    for (let i = 0; i < 10; i++) {
      buffer.push(createStdoutEvent(`Event ${i}`));
    }

    const stats = buffer.getStats();
    expect(stats.count).toBe(10);
    expect(stats.bytes).toBeLessThanOrEqual(1024);
  });

  it("evicts oldest events when full", () => {
    // Create buffer that can only hold ~2 events
    const smallBuffer = new RingBuffer(200);

    // Push events until eviction happens
    smallBuffer.push(createStdoutEvent("Event 1 - this is a long message"));
    smallBuffer.push(createStdoutEvent("Event 2 - another long message"));
    smallBuffer.push(createStdoutEvent("Event 3 - yet another long message"));

    const stats = smallBuffer.getStats();
    // Oldest events should have been evicted
    expect(stats.bytes).toBeLessThanOrEqual(200);
    expect(stats.oldestSeq).toBeGreaterThan(1); // First event was evicted
  });

  it("replays events from sequence number", () => {
    buffer.push(createStdoutEvent("A"));
    buffer.push(createStdoutEvent("B"));
    buffer.push(createStdoutEvent("C"));
    buffer.push(createStdoutEvent("D"));

    // Get events after seq 2
    const events = buffer.getFrom(2);
    expect(events.length).toBe(2);
    expect(events[0].seq).toBe(3);
    expect(events[1].seq).toBe(4);
  });

  it("returns empty array for future sequence", () => {
    buffer.push(createStdoutEvent("A"));
    buffer.push(createStdoutEvent("B"));

    const events = buffer.getFrom(100);
    expect(events.length).toBe(0);
  });

  it("preserves sequence after clear", () => {
    buffer.push(createStdoutEvent("A"));
    buffer.push(createStdoutEvent("B"));
    const seqBefore = buffer.getLatestSeq();

    buffer.clear();

    // Sequence should continue, not reset
    const seqAfter = buffer.push(createStdoutEvent("C"));
    expect(seqAfter).toBe(seqBefore + 1);
  });

  it("returns accurate stats", () => {
    buffer.push(createStdoutEvent("First"));
    buffer.push(createStdoutEvent("Second"));

    const stats = buffer.getStats();
    expect(stats.count).toBe(2);
    expect(stats.bytes).toBeGreaterThan(0);
    expect(stats.oldestSeq).toBe(1);
    expect(stats.newestSeq).toBe(2);
  });
});

describe("RingBufferManager", () => {
  let manager: RingBufferManager;

  beforeEach(() => {
    manager = new RingBufferManager(1024);
  });

  it("creates buffer for new session", () => {
    const buffer1 = manager.getOrCreate("session-1");
    const buffer2 = manager.getOrCreate("session-2");

    expect(buffer1).toBeDefined();
    expect(buffer2).toBeDefined();
    expect(buffer1).not.toBe(buffer2);
  });

  it("returns same buffer for existing session", () => {
    const buffer1 = manager.getOrCreate("session-1");
    buffer1.push(createStdoutEvent("Test"));

    const buffer2 = manager.getOrCreate("session-1");
    expect(buffer2.getLatestSeq()).toBe(1);
  });

  it("returns undefined for unknown session", () => {
    const buffer = manager.get("nonexistent");
    expect(buffer).toBeUndefined();
  });

  it("removes session buffer", () => {
    manager.getOrCreate("session-1");
    expect(manager.get("session-1")).toBeDefined();

    const removed = manager.remove("session-1");
    expect(removed).toBe(true);
    expect(manager.get("session-1")).toBeUndefined();
  });

  it("lists all sessions", () => {
    manager.getOrCreate("session-a");
    manager.getOrCreate("session-b");
    manager.getOrCreate("session-c");

    const sessions = manager.getSessions();
    expect(sessions).toHaveLength(3);
    expect(sessions).toContain("session-a");
    expect(sessions).toContain("session-b");
    expect(sessions).toContain("session-c");
  });

  it("clears all buffers", () => {
    manager.getOrCreate("session-1");
    manager.getOrCreate("session-2");

    manager.clear();
    expect(manager.getSessions()).toHaveLength(0);
  });
});
