import {
  StateAuthoringTargetSchema,
  StateAuthorRevisionSchema,
  type StatePresentationInput,
} from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

const base = (projectId: string, refName: string) =>
  `${API_V1}/projects/${encodeURIComponent(projectId)}/refs/${encodeURIComponent(refName)}`;
export async function fetchAuthoringTarget(projectId: string, refName: string) {
  return StateAuthoringTargetSchema.parse(
    await handleResponse(
      await fetchWithTimeout(`${base(projectId, refName)}/presentation-authoring`)
    )
  );
}
export async function publishAuthorRevision(
  projectId: string,
  refName: string,
  expectedHead: string,
  presentation: StatePresentationInput
) {
  return StateAuthorRevisionSchema.parse(
    await handleResponse(
      await fetchWithTimeout(`${base(projectId, refName)}/presentation-revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedHead, presentation }),
      })
    )
  );
}
