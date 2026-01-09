/**
 * AI generation and cache configuration.
 */

import { parsePositiveInt } from "./helpers.js";

// =============================================================================
// Session Entry Limits
// =============================================================================

/** Maximum entries to keep per session (prevents memory leaks) */
export const MAX_ENTRIES_PER_SESSION = 500;

// =============================================================================
// Session Age Configuration
// =============================================================================

/** Maximum session age to display (24 hours by default) */
export const MAX_AGE_HOURS = parsePositiveInt(process.env.MAX_AGE_HOURS, 24);

/** Maximum session age in milliseconds */
export const MAX_AGE_MS = MAX_AGE_HOURS * 60 * 60 * 1000;

// =============================================================================
// Summary Cache Configuration
// =============================================================================

/** Maximum entries in summary cache before eviction */
export const SUMMARY_CACHE_MAX_SIZE = 500;

/** TTL for summary cache entries (30 minutes) */
export const SUMMARY_CACHE_TTL_MS = 30 * 60 * 1000;

/** Maximum entries in goal cache before eviction */
export const GOAL_CACHE_MAX_SIZE = 500;

/** TTL for goal cache entries (30 minutes) */
export const GOAL_CACHE_TTL_MS = 30 * 60 * 1000;

// =============================================================================
// External Call Timeouts
// =============================================================================

/** Timeout for external API calls (30 seconds) */
export const EXTERNAL_CALL_TIMEOUT_MS = 30_000;

/** Timeout for gh CLI calls (15 seconds) */
export const GH_CLI_TIMEOUT_MS = 15_000;

// =============================================================================
// AI Generation Limits
// =============================================================================

/** Maximum tokens for summary generation */
export const SUMMARY_MAX_TOKENS = 100;

/** Maximum tokens for goal generation */
export const GOAL_MAX_TOKENS = 30;
