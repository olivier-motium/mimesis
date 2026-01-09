/**
 * Session scoring weights (for UI sorting).
 */

/** Status weights for activity scoring */
export const STATUS_WEIGHTS: Record<string, number> = {
  working: 100,
  waiting: 50,
  idle: 1,
};

/** Bonus score for sessions with pending tool use */
export const PENDING_TOOL_BONUS = 30;

/** Half-life for score decay (minutes) */
export const DECAY_HALF_LIFE_MINUTES = 30;
