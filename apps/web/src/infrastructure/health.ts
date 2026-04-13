/**
 * Health & Status API
 */

import { API_BASE, API_V1, fetchWithTimeout, handleResponse } from './core';

export async function checkHealth(): Promise<{ status: string; version: string; uptime: number }> {
  const res = await fetchWithTimeout(`${API_BASE}/health`, undefined, 5000);
  return handleResponse(res);
}

export async function getStatus(): Promise<{
  projects_count: number;
  conversations_count: number;
  turns_count: number;
  commits_count: number;
}> {
  const res = await fetchWithTimeout(`${API_V1}/status`);
  return handleResponse<{
    projects_count: number;
    conversations_count: number;
    turns_count: number;
    commits_count: number;
  }>(res);
}
