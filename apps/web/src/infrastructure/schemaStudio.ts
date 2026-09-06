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
