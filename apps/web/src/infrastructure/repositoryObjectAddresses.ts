import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface RepositoryObjectAddress {
  id: string;
  number: string;
  workspaceId?: string;
}

export async function getRepositoryObjectAddress(
  projectId: string,
  kind: 'commit' | 'review',
  key: string
) {
  return handleResponse<RepositoryObjectAddress>(
    await fetchWithTimeout(
      `${API_V1}/projects/${encodeURIComponent(projectId)}/object-addresses/${kind}/${encodeURIComponent(key)}`
    )
  );
}
