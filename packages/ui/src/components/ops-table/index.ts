/**
 * OpsTable module exports
 *
 * Note: OpsTable and OpsTableRow were replaced by DataTable (TanStack Table v8) in v5.
 * These utility functions are still used by the Fleet Command UI.
 */

export { countSessionsByStatus, filterSessions, sortSessions, isSessionStale } from "./utils";
export type { StatusFilter, StatusCounts } from "./types";
