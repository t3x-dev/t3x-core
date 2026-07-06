import type { WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

interface ProjectWorkspacesResponse {
  workspaces: WorkspaceCandidate[];
}

export interface WorkspaceSaveResponse {
  candidate_id: string;
  yops_draft_id?: string;
  workspace: WorkspaceCandidate;
}

export interface WorkspaceCommitResponse extends WorkspaceSaveResponse {
  commit: { hash: string };
}

export async function listProjectWorkspaces(projectId: string): Promise<WorkspaceCandidate[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces`
  );
  const data = await handleResponse<ProjectWorkspacesResponse>(res);
  return data.workspaces;
}

export async function saveProjectWorkspace(
  projectId: string,
  workspaceId: string,
  workspace: WorkspaceCandidate
): Promise<WorkspaceSaveResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}`,
    {
      body: JSON.stringify({ workspace }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
  return handleResponse<WorkspaceSaveResponse>(res);
}

export async function commitProjectWorkspace(
  projectId: string,
  workspaceId: string,
  content: { trees: WorkspaceYOpsTreeNode[]; relations: unknown[] },
  message?: string
): Promise<WorkspaceCommitResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/commit`,
    {
      body: JSON.stringify({ content, ...(message ? { message } : {}) }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return handleResponse<WorkspaceCommitResponse>(res);
}
