/**
 * Export API
 */

import { API_V1, ApiError, buildQueryString, fetchWithTimeout } from './core';

export async function exportCfpack(projectId: string): Promise<Blob> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(`${API_V1}/export/cfpack?${query}`, undefined, 30000);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: {
        code: 'EXPORT_ERROR',
        message: `Server returned HTTP ${res.status} with non-JSON body`,
      },
    }));
    throw new ApiError(
      errorData.error?.code || 'EXPORT_ERROR',
      errorData.error?.message || `Export failed: HTTP ${res.status}`
    );
  }
  return res.blob();
}

export async function exportLedger(projectId: string): Promise<Blob> {
  const query = buildQueryString({ project_id: projectId });
  const res = await fetchWithTimeout(`${API_V1}/export/ledger?${query}`, undefined, 30000);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: {
        code: 'EXPORT_ERROR',
        message: `Server returned HTTP ${res.status} with non-JSON body`,
      },
    }));
    throw new ApiError(
      errorData.error?.code || 'EXPORT_ERROR',
      errorData.error?.message || `Export failed: HTTP ${res.status}`
    );
  }
  return res.blob();
}
