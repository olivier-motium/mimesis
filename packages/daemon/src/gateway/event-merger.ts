/**
 * Event Merger - Merges PTY stdout events with hook events into ordered stream.
 *
 * The merger assigns monotonic sequence numbers to all events and handles
 * the grouping heuristic where stdout between tool.pre and tool.post
 * gets associated with that tool.
 */

import type {
  SessionEvent,
  StdoutEvent,
  ToolEvent,
  HookEvent,
} from "./protocol.js";
import type { RingBuffer } from "./ring-buffer.js";

interface ActiveTool {
  toolName: string;
  startSeq: number;
  startTime: string;
}

/**
 * Merges PTY and hook events for a single session.
 */
export class EventMerger {
  private buffer: RingBuffer;
  private activeTool: ActiveTool | null = null;

  constructor(buffer: RingBuffer) {
    this.buffer = buffer;
  }

  /**
   * Add a stdout event from PTY.
   * Returns the sequence number assigned.
   */
  addStdout(data: string): number {
    const event: StdoutEvent = {
      type: "stdout",
      data,
      timestamp: new Date().toISOString(),
    };
    return this.buffer.push(event);
  }

  /**
   * Add a hook event.
   * Transforms hook payload into SessionEvent and assigns sequence.
   */
  addHookEvent(hook: HookEvent): number {
    const event = this.transformHookEvent(hook);
    if (!event) return -1;

    const seq = this.buffer.push(event);

    // Track active tool for grouping heuristic
    if (event.type === "tool") {
      if (event.phase === "pre") {
        this.activeTool = {
          toolName: event.tool_name,
          startSeq: seq,
          startTime: event.timestamp,
        };
      } else if (event.phase === "post") {
        this.activeTool = null;
      }
    }

    return seq;
  }

  /**
   * Transform a hook event into a session event.
   */
  private transformHookEvent(hook: HookEvent): SessionEvent | null {
    const timestamp = hook.timestamp ?? new Date().toISOString();

    // PostToolUse hooks become tool events
    if (hook.hook_type === "PostToolUse" || hook.tool_name) {
      const toolEvent: ToolEvent = {
        type: "tool",
        phase: hook.phase ?? "post",
        tool_name: hook.tool_name ?? "unknown",
        tool_input: hook.tool_input,
        tool_result: hook.tool_result,
        ok: hook.ok ?? true,
        timestamp,
      };
      return toolEvent;
    }

    // PreToolUse hooks
    if (hook.hook_type === "PreToolUse") {
      const toolEvent: ToolEvent = {
        type: "tool",
        phase: "pre",
        tool_name: hook.tool_name ?? "unknown",
        tool_input: hook.tool_input,
        timestamp,
      };
      return toolEvent;
    }

    // Status change events
    if (hook.event_type === "status_change") {
      return {
        type: "status_change",
        from: String(hook.tool_input ?? "unknown"),
        to: String(hook.tool_result ?? "unknown"),
        timestamp,
      };
    }

    // Default: ignore unknown hook types
    return null;
  }

  /**
   * Check if there's an active tool (stdout should be grouped with it).
   */
  getActiveTool(): ActiveTool | null {
    return this.activeTool;
  }

  /**
   * Get events from the buffer starting from a sequence number.
   */
  getEventsFrom(fromSeq: number): Array<{ seq: number; event: SessionEvent }> {
    return this.buffer.getFrom(fromSeq).map(({ seq, event }) => ({ seq, event }));
  }

  /**
   * Get the latest sequence number.
   */
  getLatestSeq(): number {
    return this.buffer.getLatestSeq();
  }

  /**
   * Get buffer statistics.
   */
  getStats(): { count: number; bytes: number; oldestSeq: number; newestSeq: number } {
    return this.buffer.getStats();
  }
}

/**
 * Manages event mergers for multiple sessions.
 */
export class EventMergerManager {
  private mergers = new Map<string, EventMerger>();
  private bufferFactory: (sessionId: string) => RingBuffer;

  constructor(bufferFactory: (sessionId: string) => RingBuffer) {
    this.bufferFactory = bufferFactory;
  }

  /**
   * Get or create a merger for a session.
   */
  getOrCreate(sessionId: string): EventMerger {
    let merger = this.mergers.get(sessionId);
    if (!merger) {
      const buffer = this.bufferFactory(sessionId);
      merger = new EventMerger(buffer);
      this.mergers.set(sessionId, merger);
    }
    return merger;
  }

  /**
   * Get a merger for a session.
   */
  get(sessionId: string): EventMerger | undefined {
    return this.mergers.get(sessionId);
  }

  /**
   * Remove a session's merger.
   */
  remove(sessionId: string): boolean {
    return this.mergers.delete(sessionId);
  }

  /**
   * Get all session IDs with mergers.
   */
  getSessions(): string[] {
    return Array.from(this.mergers.keys());
  }

  /**
   * Clear all mergers.
   */
  clear(): void {
    this.mergers.clear();
  }
}
