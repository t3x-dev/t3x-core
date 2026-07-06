import type { WorkspaceCandidate } from '@/types/workspaces';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

interface ProjectWorkspacesResponse {
  workspaces: WorkspaceCandidate[];
}

export async function listProjectWorkspaces(projectId: string): Promise<WorkspaceCandidate[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces`
  );
  const data = await handleResponse<ProjectWorkspacesResponse>(res);
  return data.workspaces;
}
