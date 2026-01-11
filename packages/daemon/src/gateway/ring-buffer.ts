/**
 * Ring Buffer for Session Event Replay
 *
 * Stores session events in a fixed-size circular buffer for replay on reconnect.
 * Size is configurable (default 20MB per session from config).
 */

import type { SessionEvent } from "./protocol.js";

export interface BufferedEvent {
  seq: number;
  event: SessionEvent;
  sizeBytes: number;
}

/**
 * Ring buffer for storing session events with size-based eviction.
 */
export class RingBuffer {
  private buffer: BufferedEvent[] = [];
  private totalBytes = 0;
  private nextSeq = 1;
  private readonly maxSizeBytes: number;

  constructor(maxSizeBytes: number) {
    this.maxSizeBytes = maxSizeBytes;
  }

  /**
   * Add an event to the buffer.
   * Older events are evicted if buffer exceeds max size.
   */
  push(event: SessionEvent): number {
    const seq = this.nextSeq++;
    const eventJson = JSON.stringify(event);
    const sizeBytes = Buffer.byteLength(eventJson, "utf8");

    // Evict old events if needed
    while (this.totalBytes + sizeBytes > this.maxSizeBytes && this.buffer.length > 0) {
      const evicted = this.buffer.shift();
      if (evicted) {
        this.totalBytes -= evicted.sizeBytes;
      }
    }

    // Add new event
    this.buffer.push({ seq, event, sizeBytes });
    this.totalBytes += sizeBytes;

    return seq;
  }

  /**
   * Get events starting from a sequence number.
   * Returns events with seq > fromSeq.
   */
  getFrom(fromSeq: number): BufferedEvent[] {
    return this.buffer.filter((e) => e.seq > fromSeq);
  }

  /**
   * Get the latest sequence number.
   */
  getLatestSeq(): number {
    return this.nextSeq - 1;
  }

  /**
   * Get buffer statistics.
   */
  getStats(): { count: number; bytes: number; oldestSeq: number; newestSeq: number } {
    return {
      count: this.buffer.length,
      bytes: this.totalBytes,
      oldestSeq: this.buffer[0]?.seq ?? 0,
      newestSeq: this.nextSeq - 1,
    };
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.buffer = [];
    this.totalBytes = 0;
    // Don't reset nextSeq to preserve monotonicity
  }
}

/**
 * Manager for multiple session ring buffers.
 */
export class RingBufferManager {
  private buffers = new Map<string, RingBuffer>();
  private readonly maxSizePerSession: number;

  constructor(maxSizePerSession: number) {
    this.maxSizePerSession = maxSizePerSession;
  }

  /**
   * Get or create a ring buffer for a session.
   */
  getOrCreate(sessionId: string): RingBuffer {
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = new RingBuffer(this.maxSizePerSession);
      this.buffers.set(sessionId, buffer);
    }
    return buffer;
  }

  /**
   * Get a ring buffer for a session (returns undefined if not exists).
   */
  get(sessionId: string): RingBuffer | undefined {
    return this.buffers.get(sessionId);
  }

  /**
   * Remove a session's ring buffer.
   */
  remove(sessionId: string): boolean {
    return this.buffers.delete(sessionId);
  }

  /**
   * Get all session IDs with buffers.
   */
  getSessions(): string[] {
    return Array.from(this.buffers.keys());
  }

  /**
   * Clear all buffers.
   */
  clear(): void {
    this.buffers.clear();
  }
}
