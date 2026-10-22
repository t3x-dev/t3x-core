import {
  ExploreSchemaReleaseSchema,
  PublicProjectDetailSchema,
  PublicProjectPageSchema,
  SchemaTargetPageSchema,
} from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export async function fetchPublicProjects(query: string) {
  return PublicProjectPageSchema.parse(
    await handleResponse(await fetchWithTimeout(`${API_V1}/explore/projects?${query}`))
  );
}
export async function fetchPublicProject(projectId: string) {
  return PublicProjectDetailSchema.parse(
    await handleResponse(
      await fetchWithTimeout(`${API_V1}/explore/projects/${encodeURIComponent(projectId)}`)
    )
  );
}
export async function fetchSchemaTargets(query: string) {
  return SchemaTargetPageSchema.parse(
    await handleResponse(await fetchWithTimeout(`${API_V1}/explore/schema-targets?${query}`))
  );
}
export async function fetchExploreRelease(query: string) {
  const result = ExploreSchemaReleaseSchema.parse(
    await handleResponse(await fetchWithTimeout(`${API_V1}/explore/schema-release?${query}`))
  );
  const params = new URLSearchParams(query);
  if (
    result.artifactHash !== params.get('expectedHash') ||
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
