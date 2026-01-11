/**
 * UI Type Facade
 *
 * Re-exports only what the UI needs from the daemon schema.
 * This creates a single point of dependency on the daemon types,
 * making it easier to evolve the daemon schema independently.
 */

// Type exports - UI reads these from gateway or converts from TrackedSession
export type {
  Session,
  SessionStatus,
  FileStatusValue,
  RecentOutput,
  TerminalLink,
  EmbeddedPty,
  PendingTool,
} from "@mimesis/daemon/schema";
