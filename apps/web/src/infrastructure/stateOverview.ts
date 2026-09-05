import { StateOverviewSchema } from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';
export async function fetchStateOverview(projectId: string, commitDigest: string) {
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/commits/${encodeURIComponent(commitDigest)}/overview`
  );
  const overview = StateOverviewSchema.parse(await handleResponse(response));
  if (
    overview.revision.commitDigest !== commitDigest ||
    overview.render.context.sourceCommit.digest !== commitDigest ||
    overview.revision.stateDigest !== overview.render.context.sourceState.digest
  ) {
    throw new Error('Overview does not match the selected revision');
  }
  return overview;
}
