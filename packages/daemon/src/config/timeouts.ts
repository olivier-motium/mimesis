/**
 * Timeout constants (milliseconds).
 */

/** Time before a session is considered idle (5 minutes) */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** Time to wait before detecting pending tool approval (5 seconds) */
export const APPROVAL_TIMEOUT_MS = 5 * 1000;

/** Time before a working session without tool use is considered stale (60 seconds) */
export const STALE_TIMEOUT_MS = 60 * 1000;

/** Threshold for "recent" sessions in CLI (1 hour) */
export const RECENT_THRESHOLD_MS = 60 * 60 * 1000;
