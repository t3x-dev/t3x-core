import {
  type AddStudioCandidate,
  StudioCandidateListSchema,
  StudioCandidateSchema,
} from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

const path = (projectId: string) =>
  `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/candidates`;
export async function listStudioCandidates(projectId: string) {
  return StudioCandidateListSchema.parse(
    await handleResponse(await fetchWithTimeout(path(projectId)))
  ).items;
}
export async function addStudioCandidate(projectId: string, source: AddStudioCandidate) {
  return StudioCandidateSchema.parse(
    await handleResponse(
      await fetchWithTimeout(path(projectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source),
      })
    )
  );
}
export async function removeStudioCandidate(projectId: string, id: string) {
  await handleResponse(
    await fetchWithTimeout(`${path(projectId)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );
}

export async function previewStudioSelection(
  projectId: string,
  input: import('@t3x-dev/api-client').StudioPreviewInput
) {
  const { StudioPreviewSchema } = await import('@t3x-dev/api-client');
  return StudioPreviewSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      )
    )
  );
}
export async function applyStudioSelection(
  projectId: string,
  input: { candidateIds: string[]; workspaceId: string; ifRevision: number; reviewHash: string }
) {
  return handleResponse(
    await fetchWithTimeout(
      `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }
    )
  );
}
