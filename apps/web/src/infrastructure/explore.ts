import {
  ExploreSchemaReleaseSchema,
  PublicProjectDetailSchema,
  PublicProjectPageSchema,
  SchemaTargetPageSchema,
} from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export async function fetchPublicProjects(query: string, signal?: AbortSignal) {
  return PublicProjectPageSchema.parse(
    await handleResponse(
      await fetchWithTimeout(`${API_V1}/explore/projects?${query}`, undefined, undefined, signal)
    )
  );
}
export async function fetchPublicProject(projectId: string, signal?: AbortSignal) {
  return PublicProjectDetailSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/explore/projects/${encodeURIComponent(projectId)}`,
        undefined,
        undefined,
        signal
      )
    )
  );
}
export async function fetchSchemaTargets(query: string, signal?: AbortSignal) {
  return SchemaTargetPageSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/explore/schema-targets?${query}`,
        undefined,
        undefined,
        signal
      )
    )
  );
}
export async function fetchExploreRelease(query: string, signal?: AbortSignal) {
  const result = ExploreSchemaReleaseSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/explore/schema-release?${query}`,
        undefined,
        undefined,
        signal
      )
    )
  );
  const params = new URLSearchParams(query);
  const expectedHash = params.get('expectedHash');
  if (
    (expectedHash !== null && result.artifactHash !== expectedHash) ||
    (expectedHash === null && result.item.identity.ownerProjectId !== null) ||
    result.item.release.hash !== result.artifactHash ||
    result.item.identity.canonicalName !== params.get('canonicalName') ||
    result.item.release.version !== params.get('version') ||
    (params.has('sourceProjectId') &&
      result.item.identity.ownerProjectId !== params.get('sourceProjectId'))
  ) {
    throw new Error('Release does not match the selected source, version and hash.');
  }
  return result;
}
