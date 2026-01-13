import { z } from "zod";
import { createStateSchema } from "@durable-streams/state";

// Session status enum
export const SessionStatusSchema = z.enum(["working", "waiting", "idle"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// Pending tool info
export const PendingToolSchema = z.object({
  tool: z.string(),
  target: z.string(),
});
export type PendingTool = z.infer<typeof PendingToolSchema>;

// Recent output entry for live view
export const RecentOutputSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string(),
});
export type RecentOutput = z.infer<typeof RecentOutputSchema>;

// Terminal link info (kitty)
export const TerminalLinkSchema = z.object({
  kittyWindowId: z.number(),
  linkedAt: z.string(), // ISO timestamp
  stale: z.boolean(),
});
export type TerminalLink = z.infer<typeof TerminalLinkSchema>;

// Embedded PTY info
export const EmbeddedPtySchema = z.object({
  ptyId: z.string(),
  wsUrl: z.string(),
  connectedAt: z.string(), // ISO timestamp
  active: z.boolean(),
});
export type EmbeddedPty = z.infer<typeof EmbeddedPtySchema>;

// File-based status (from .claude/status.md)
export const FileStatusValueSchema = z.enum([
  "working",
  "waiting_for_approval",
  "waiting_for_input",
  "completed",
  "error",
  "blocked",
  "idle",
]);
export type FileStatusValue = z.infer<typeof FileStatusValueSchema>;

export const FileStatusSchema = z.object({
  status: FileStatusValueSchema,
  updated: z.string(), // ISO timestamp
  task: z.string().optional(),
  summary: z.string().optional(),
  blockers: z.string().optional(),
  nextSteps: z.string().optional(),
});
export type FileStatus = z.infer<typeof FileStatusSchema>;

// Main session state schema
export const SessionSchema = z.object({
  sessionId: z.string(),
  cwd: z.string(),
  gitBranch: z.string().nullable(),
  gitRepoUrl: z.string().nullable(),
  gitRepoId: z.string().nullable(),
  originalPrompt: z.string(),
  status: SessionStatusSchema,
  createdAt: z.string(), // ISO timestamp - when session was first discovered
  lastActivityAt: z.string(), // ISO timestamp
  messageCount: z.number(),
  hasPendingToolUse: z.boolean(),
  pendingTool: PendingToolSchema.nullable(),
  goal: z.string(), // High-level goal of the session
  summary: z.string(), // Current activity summary
  recentOutput: z.array(RecentOutputSchema), // Last few messages for live view
  terminalLink: TerminalLinkSchema.nullable(), // Linked kitty terminal window
  embeddedPty: EmbeddedPtySchema.nullable(), // Embedded PTY terminal
  fileStatus: FileStatusSchema.nullable(), // File-based status from .claude/status.md
  // Work chain tracking (for compaction)
  workChainId: z.string().nullable(), // UUID identifying the work chain this session belongs to
  workChainName: z.string().nullable(), // User-defined name for the work chain
  compactionCount: z.number(), // How many times this work chain has been compacted (0 = never)
  // Supersession tracking (for compaction)
  superseded: z.boolean(), // Whether this session has been superseded by a compacted session
  supersededBy: z.string().nullable(), // Session ID that superseded this one
  supersededAt: z.string().nullable(), // ISO timestamp when supersession occurred
});
export type Session = z.infer<typeof SessionSchema>;

// Create the state schema for durable streams
export const sessionsStateSchema = createStateSchema({
  sessions: {
    schema: SessionSchema,
    type: "session",
    primaryKey: "sessionId",
  },
});

// =============================================================================
// SEGMENT ROTATION ARCHITECTURE
// =============================================================================
// These types support the "kitty effect" where compaction rotates sessions
// within a stable UI tab rather than creating new tabs.
// Core concept: Tab → Segments (1:many) instead of Tab → Session (1:1)

/** Reason why a segment was created */
export const SegmentReasonSchema = z.enum([
  "startup",  // New terminal tab, first session
  "resume",   // Resumed from explicit --resume
  "compact",  // Created from compaction
  "clear",    // Created from /clear
]);
export type SegmentReason = z.infer<typeof SegmentReasonSchema>;

/** Trigger for compaction */
export const CompactTriggerSchema = z.enum(["auto", "manual"]);
export type CompactTrigger = z.infer<typeof CompactTriggerSchema>;

/** One segment of work within a tab (one Claude session) */
export const ClaudeSegmentSchema = z.object({
  sessionId: z.string(),
  transcriptPath: z.string(),
  startedAt: z.string(),      // ISO timestamp
  endedAt: z.string().optional(),  // Set when compacted/ended
  reason: SegmentReasonSchema,
  trigger: CompactTriggerSchema.optional(),  // For compact events
});
export type ClaudeSegment = z.infer<typeof ClaudeSegmentSchema>;

/** Stable UI tab that persists across compactions */
export const TerminalTabSchema = z.object({
  tabId: z.string(),              // Stable, UI-generated UUID
  ptyId: z.string().optional(),   // Runtime PTY ID (if active)
  repoRoot: z.string(),
  segments: z.array(ClaudeSegmentSchema),  // Append-only chain
  activeSegmentIndex: z.number(), // Points to current segment (-1 if none)
  createdAt: z.string(),          // ISO timestamp
  lastActivityAt: z.string(),     // ISO timestamp
});
export type TerminalTab = z.infer<typeof TerminalTabSchema>;

/** Hook event payload from emit-hook-event.py */
export const HookEventPayloadSchema = z.object({
  hook_event_name: z.string(),
  session_id: z.string().optional(),
  transcript_path: z.string().optional(),
  source: z.string().optional(),
  trigger: z.string().optional(),
  command_center_tab_id: z.string().nullable(),
  command_center_task_id: z.string().nullable(),
  cwd: z.string().optional(),
});
export type HookEventPayload = z.infer<typeof HookEventPayloadSchema>;

// Re-export tool registry for UI consumption
export {
  TOOL_REGISTRY,
  TOOL_NAMES,
  type ToolName,
  type ToolConfig,
  formatToolUse,
  getToolIcon,
} from "./tools/index.js";

// =============================================================================
// KNOWLEDGE BASE SCHEMAS
// =============================================================================
// Shared types for the Commander Knowledge Base system

/** KB sync type */
export const KBSyncTypeSchema = z.enum(["full", "incremental"]);
export type KBSyncType = z.infer<typeof KBSyncTypeSchema>;

/** KB Project from API */
export const KBProjectSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  lastSyncAt: z.string().nullable(),
  syncType: KBSyncTypeSchema.nullable(),
  lastCommitSeen: z.string().nullable(),
  filesProcessed: z.number(),
  briefingCount: z.number(),
  isStale: z.boolean(),
  hasKb: z.boolean(),
});
export type KBProject = z.infer<typeof KBProjectSchema>;

/** KB Project details (single project view) */
export const KBProjectDetailSchema = KBProjectSchema.extend({
  files: z.array(z.string()),
}).omit({ hasKb: true });
export type KBProjectDetail = z.infer<typeof KBProjectDetailSchema>;

/** KB Statistics */
export const KBStatsSchema = z.object({
  totalProjects: z.number(),
  staleProjects: z.number(),
  neverSynced: z.number(),
  totalBriefings: z.number(),
});
export type KBStats = z.infer<typeof KBStatsSchema>;

/** KB Summary content */
export const KBSummarySchema = z.object({
  projectId: z.string(),
  frontmatter: z.record(z.string(), z.string()).nullable(),
  content: z.string(),
});
export type KBSummary = z.infer<typeof KBSummarySchema>;

/** KB Activity content */
export const KBActivitySchema = z.object({
  projectId: z.string(),
  frontmatter: z.record(z.string(), z.string()).nullable(),
  content: z.string(),
});
export type KBActivity = z.infer<typeof KBActivitySchema>;

/** KB sync response */
export const KBSyncResponseSchema = z.object({
  message: z.string(),
  hint: z.string(),
});
export type KBSyncResponse = z.infer<typeof KBSyncResponseSchema>;
