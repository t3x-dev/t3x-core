import { API_V1, fetchWithTimeout, handleResponse } from '@/infrastructure/core';
import { workspaceWritePayload } from '@/infrastructure/workspaces';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';

export interface WorkspaceFlowResponse {
  candidate_id: string;
  yops_draft_id?: string;
  workspace: WorkspaceCandidate;
}

export async function extractWorkspaceCandidate(
  candidate: WorkspaceCandidate
): Promise<WorkspaceFlowResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(candidate.projectId)}/workspaces/${encodeURIComponent(
      candidate.id
    )}/extract-candidate`,
    {
      body: JSON.stringify({
        sources: candidate.sourceBundle.map(sourceToRequest),
        ...workspaceWritePayload(candidate),
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );

  return handleResponse<WorkspaceFlowResponse>(res);
}

export async function sendWorkspaceYOpsDraft(
  candidate: WorkspaceCandidate
): Promise<WorkspaceFlowResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(candidate.projectId)}/workspaces/${encodeURIComponent(
      candidate.id
    )}/yops-draft`,
    {
      body: JSON.stringify(workspaceWritePayload(candidate)),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );

  return handleResponse<WorkspaceFlowResponse>(res);
}

function sourceToRequest(source: SourceBundleItem) {
  return {
    contentHash: source.contentHash,
    conversationId: source.conversationId,
    description: source.description,
    fileName: source.fileName,
    id: source.id,
    materialId: source.materialId,
    previewText: source.previewText,
    previewTurns: source.previewTurns,
    title: source.title,
    tokenEstimate: source.tokenEstimate,
    type: source.type,
  };
}
