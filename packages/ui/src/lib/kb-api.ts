/**
 * API client for Knowledge Base endpoints.
 * Types imported from shared schema (@mimesis/daemon/schema).
 */

import { config } from "../config";
import type {
  KBProject,
  KBStats,
  KBSummary,
  KBActivity,
  KBProjectDetail,
  KBSyncResponse,
} from "@mimesis/daemon/schema";

const API_BASE = config.api.baseUrl;

// Re-export types for convenience
export type { KBProject, KBStats, KBSummary, KBActivity, KBProjectDetail, KBSyncResponse };

/**
 * Make an API call with proper error handling.
 */
async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get all KB projects with sync state.
 */
export async function getKBProjects(): Promise<{
  initialized: boolean;
  projects: KBProject[];
  message?: string;
}> {
  const response = await apiCall<{
    success: boolean;
    initialized: boolean;
    projects: KBProject[];
    message?: string;
  }>("/kb/projects");
  return {
    initialized: response.initialized,
    projects: response.projects,
    message: response.message,
  };
}

/**
 * Get KB project details.
 */
export async function getKBProject(projectId: string): Promise<KBProjectDetail> {
  const response = await apiCall<{
    success: boolean;
    project: KBProjectDetail;
  }>(`/kb/projects/${encodeURIComponent(projectId)}`);
  return response.project;
}

/**
 * Get KB project summary.
 */
export async function getKBSummary(projectId: string): Promise<KBSummary> {
  const response = await apiCall<{
    success: boolean;
    summary: KBSummary;
  }>(`/kb/projects/${encodeURIComponent(projectId)}/summary`);
  return response.summary;
}

/**
 * Get KB project activity.
 */
export async function getKBActivity(projectId: string): Promise<KBActivity> {
  const response = await apiCall<{
    success: boolean;
    activity: KBActivity;
  }>(`/kb/projects/${encodeURIComponent(projectId)}/activity`);
  return response.activity;
}

/**
 * Get KB statistics.
 */
export async function getKBStats(): Promise<KBStats & { initialized: boolean }> {
  const response = await apiCall<{
    success: boolean;
    initialized: boolean;
    stats: KBStats;
  }>("/kb/stats");
  return {
    ...response.stats,
    initialized: response.initialized,
  };
}

/**
 * Trigger KB sync for all projects.
 * Note: Returns instructions - actual sync requires Commander.
 */
export async function triggerKBSync(full: boolean = false): Promise<KBSyncResponse> {
  const response = await apiCall<{
    success: boolean;
  } & KBSyncResponse>("/kb/sync", {
    method: "POST",
    body: JSON.stringify({ full }),
  });
  return { message: response.message, hint: response.hint };
}

/**
 * Trigger KB sync for a specific project.
 * Note: Returns instructions - actual sync requires Commander.
 */
export async function triggerProjectKBSync(
  projectId: string,
  full: boolean = false
): Promise<KBSyncResponse> {
  const response = await apiCall<{
    success: boolean;
  } & KBSyncResponse>(`/kb/sync/${encodeURIComponent(projectId)}`, {
    method: "POST",
    body: JSON.stringify({ full }),
  });
  return { message: response.message, hint: response.hint };
}
