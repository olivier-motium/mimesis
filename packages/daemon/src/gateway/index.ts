/**
 * Fleet Gateway - Two-Way I/O Bridge
 *
 * Provides:
 * - WebSocket connection management
 * - PTY session lifecycle (spawn, attach, detach)
 * - Event streaming (PTY stdout + hook events merged)
 * - Fleet events (outbox broadcast)
 * - Headless job management (Commander, maintenance)
 *
 * Replaces the old pty/ws-server.ts with unified gateway.
 */

// Main server
export { GatewayServer } from "./gateway-server.js";

// Session store (v5.2 unified session tracking)
export {
  SessionStore,
  type SessionSource,
  type UIStatus,
  type TrackedSession,
  type WatcherSessionData,
  type PtySessionData,
  type SessionStoreEvent,
  type SessionDiscoveredEvent,
  type SessionUpdatedEvent,
  type SessionRemovedEvent,
} from "./session-store.js";

// Core components
export { PtyBridge, type PtySessionInfo, type PtyBridgeCallbacks } from "./pty-bridge.js";
export { EventMerger, EventMergerManager } from "./event-merger.js";
export { RingBuffer, RingBufferManager, type BufferedEvent } from "./ring-buffer.js";
export { OutboxTailer, type OutboxEvent, type FleetEventListener } from "./outbox-tailer.js";

// Job system
export { JobRunner, type JobRequest, type JobResult, type StreamChunkCallback } from "./job-runner.js";
export { JobManager, type JobEventListener } from "./job-manager.js";

// Parsing
export {
  StreamParser,
  parseStreamLine,
  type StreamParserEvent,
  type ParsedMessage,
  type ParsedTextContent,
  type ParsedThinkingContent,
  type ParsedToolUseContent,
  type ParsedError,
} from "./stream-parser.js";

// Subscription management
export {
  SubscriptionManager,
  type ConnectionScope,
  type MessageCategory,
} from "./subscription-manager.js";

// Protocol types
export {
  // Client messages
  type ClientMessage,
  type PingMessage,
  type FleetSubscribeMessage,
  type SessionCreateMessage,
  type SessionAttachMessage,
  type SessionDetachMessage,
  type SessionStdinMessage,
  type SessionSignalMessage,
  type SessionResizeMessage,
  type JobCreateMessage,
  type JobCancelMessage,
  // Gateway messages
  type GatewayMessage,
  type PongMessage,
  type FleetEventMessage,
  type FleetEventPayload,
  type SessionCreatedMessage,
  type SessionStatusMessage,
  type SessionEndedMessage,
  type SessionEventMessage,
  type JobStartedMessage,
  type JobStreamMessage,
  type JobCompletedMessage,
  type ErrorMessage,
  // Scope & subscription messages
  type ScopeSetMessage,
  type SessionSubscribeMessage,
  type SessionUnsubscribeMessage,
  // Session tracking messages (v5.2)
  type SessionsListMessage,
  type SessionsSnapshotMessage,
  type SessionDiscoveredMessage,
  type SessionUpdatedMessage,
  type SessionRemovedMessage,
  // Session events
  type SessionEvent,
  type StdoutEvent,
  type ToolEvent,
  type TextEvent,
  type ThinkingEvent,
  type ProgressEvent,
  type StatusChangeEvent,
  // Stream chunks
  type StreamJsonChunk,
  // Hook events
  type HookEvent,
  // Utilities
  parseClientMessage,
  serializeGatewayMessage,
  parseHookEvent,
} from "./protocol.js";
