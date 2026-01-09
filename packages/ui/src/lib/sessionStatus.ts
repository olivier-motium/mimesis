/**
 * Utilities for determining effective session status.
 * Handles the mapping from file-based status (7 values) to UI status (3 values).
 */

import type { Session, FileStatusValue, SessionStatus } from "@claude-code-ui/daemon/schema";

/** TTL for file-based status (5 minutes) */
const FILE_STATUS_TTL_MS = 5 * 60 * 1000;

/** Result of effective status calculation */
export interface EffectiveStatus {
  /** UI status for column placement (3 values) */
  status: SessionStatus;
  /** Original file status value if fresh, null otherwise */
  fileStatusValue: FileStatusValue | null;
  /** Whether file status is being used */
  isFileStatusFresh: boolean;
}

/**
 * Check if a file status timestamp is stale.
 */
export function isFileStatusStale(updated: string, ttlMs = FILE_STATUS_TTL_MS): boolean {
  const updatedTime = new Date(updated).getTime();
  return Date.now() - updatedTime > ttlMs;
}

/**
 * Map a file status value (7 options) to UI status (3 options).
 */
export function mapFileStatusToUiStatus(fileStatus: FileStatusValue): SessionStatus {
  switch (fileStatus) {
    case "working":
      return "working";
    case "waiting_for_approval":
    case "waiting_for_input":
      return "waiting";
    case "completed":
    case "error":
    case "blocked":
    case "idle":
      return "idle";
  }
}

/**
 * Get the effective status for a session.
 * Uses file-based status if available and fresh, otherwise falls back to XState-derived status.
 */
export function getEffectiveStatus(session: Session): EffectiveStatus {
  const fileStatus = session.fileStatus;

  // Check if we have fresh file-based status
  if (fileStatus && !isFileStatusStale(fileStatus.updated)) {
    return {
      status: mapFileStatusToUiStatus(fileStatus.status),
      fileStatusValue: fileStatus.status,
      isFileStatusFresh: true,
    };
  }

  // Fallback to XState-derived status
  return {
    status: session.status,
    fileStatusValue: null,
    isFileStatusFresh: false,
  };
}

/**
 * Check if a session should show a status badge (completed, error, blocked).
 */
export function shouldShowStatusBadge(session: Session): boolean {
  const { fileStatusValue } = getEffectiveStatus(session);
  return fileStatusValue === "completed" || fileStatusValue === "error" || fileStatusValue === "blocked";
}

/**
 * Get the badge type for a session's file status.
 */
export function getStatusBadgeType(session: Session): "completed" | "error" | "blocked" | null {
  const { fileStatusValue } = getEffectiveStatus(session);
  if (fileStatusValue === "completed" || fileStatusValue === "error" || fileStatusValue === "blocked") {
    return fileStatusValue;
  }
  return null;
}
