/**
 * Content length limits for display and truncation.
 */

// =============================================================================
// Content Length Limits
// =============================================================================

/** Standard truncation length for text content */
export const CONTENT_TRUNCATE_LENGTH = 300;

/** Preview length for longer content in output display */
export const CONTENT_PREVIEW_LENGTH = 500;

/** Truncation length for user prompt content */
export const USER_PROMPT_TRUNCATE_LENGTH = 200;

/** Short content length for JSON/tool input display */
export const SHORT_CONTENT_LENGTH = 50;

/** Truncation length for context text blocks */
export const CONTEXT_TEXT_LENGTH = 150;

/** Short truncation for text in context */
export const SHORT_CONTEXT_LENGTH = 100;

/** Short user content length in context */
export const SHORT_USER_CONTENT_LENGTH = 80;

/** Command truncation length for display */
export const COMMAND_TRUNCATE_LENGTH = 60;

/** Goal text truncation length */
export const GOAL_TRUNCATE_LENGTH = 50;

// =============================================================================
// Entry/Message Counts
// =============================================================================

/** Number of messages to look back for extracting output */
export const MESSAGE_LOOKBACK_COUNT = 20;

/** Number of characters to show for session ID display */
export const SESSION_ID_DISPLAY_LENGTH = 8;

/** Number of early entries to examine for context */
export const EARLY_ENTRIES_COUNT = 5;

/** Number of recent entries to examine for context */
export const RECENT_ENTRIES_COUNT = 10;

/** Maximum items to show in recent output */
export const RECENT_OUTPUT_MAX_ITEMS = 8;
