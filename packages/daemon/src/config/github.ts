/**
 * GitHub PR polling configuration.
 */

/** Cache TTL for PR info (1 minute) */
export const PR_CACHE_TTL = 60_000;

/** CI polling interval while checks are running (30 seconds) */
export const CI_POLL_INTERVAL_ACTIVE = 30_000;

/** CI polling interval after checks complete (5 minutes) */
export const CI_POLL_INTERVAL_IDLE = 5 * 60_000;

/** Maximum entries in PR cache before pruning */
export const PR_CACHE_MAX_SIZE = 1000;

/** TTL for individual cache entries (30 minutes) */
export const PR_CACHE_ENTRY_TTL = 30 * 60 * 1000;
