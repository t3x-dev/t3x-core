import type { CheckRecord } from '@/domain/project/checks';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export async function getProjectChecks(projectId: string, query: string, signal?: AbortSignal) {
  return handleResponse<{ records: CheckRecord[]; next_cursor: string | null }>(
    await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}/checks?${query}`, {
      signal,
    })
  );
}
export async function getProjectCheck(projectId: string, id: string, signal?: AbortSignal) {
  return handleResponse<CheckRecord>(
    await fetchWithTimeout(
      `${API_V1}/projects/${encodeURIComponent(projectId)}/checks/${encodeURIComponent(id)}`,
      { signal }
    )
  );
}
