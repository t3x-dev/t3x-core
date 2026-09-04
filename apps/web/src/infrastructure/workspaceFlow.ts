import { T3xApiError } from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from '@/infrastructure/core';
import { workspaceWritePayload } from '@/infrastructure/workspaces';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';
import { getSharedApiClient } from './sharedApiClient';

export interface WorkspaceFlowResponse {
  candidate_id: string;
  yops_draft_id?: string;
  workspace: WorkspaceCandidate;
}

export interface WorkspaceExtractionOptions {
  provider?: string;
  model?: string;
}

export async function extractWorkspaceCandidate(
  candidate: WorkspaceCandidate,
  options: WorkspaceExtractionOptions = {}
): Promise<WorkspaceFlowResponse> {
  const serverOwnedProposal = workspaceExtractionProposalInput(candidate, options);
  if (serverOwnedProposal) {
    try {
      const result = await getSharedApiClient().workspaces.createExtractionProposal(
        candidate.projectId,
        candidate.id,
        serverOwnedProposal
      );
      return {
        candidate_id: result.candidate_id,
        workspace: result.workspace as unknown as WorkspaceCandidate,
      };
    } catch (error) {
      if (error instanceof T3xApiError) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

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

function workspaceExtractionProposalInput(
  candidate: WorkspaceCandidate,
  options: WorkspaceExtractionOptions
) {
  // The server-owned proposal endpoint currently accepts one immutable
  // conversation source. Mixed evidence must stay on the aggregate fallback
  // so files/imports are not silently dropped when chat is also selected.
  if (candidate.sourceBundle.some((source) => source.type !== 'chat')) return null;
  const chatSources = candidate.sourceBundle.filter(
    (source) =>
      source.type === 'chat' &&
      typeof source.conversationId === 'string' &&
      source.conversationId.length > 0 &&
      Array.isArray(source.previewTurns) &&
      source.previewTurns.length > 0
  );
  if (chatSources.length !== 1) return null;
  const [source] = chatSources;
  const turnHashes = [...new Set(source.previewTurns?.map((turn) => turn.id).filter(Boolean))];
  if (turnHashes.length === 0) return null;
  return {
    source: {
      type: 'conversation' as const,
      id: source.conversationId as string,
      turn_hashes: turnHashes,
    },
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.model ? { model: options.model } : {}),
    ...(candidate.revision === undefined ? {} : { if_revision: candidate.revision }),
  };
}
