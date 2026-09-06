import {
  SchemaCatalogCollectionsSchema,
  SchemaCatalogPageSchema,
  type SchemaReleasePresentationReference,
  StatePresentationResultSchema,
} from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export async function fetchSchemaCatalog(projectId: string, query: string) {
  return SchemaCatalogPageSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/projects/${encodeURIComponent(projectId)}/yschema/catalog?${query}`
      )
    )
  );
}
export async function fetchSchemaCollections() {
  return SchemaCatalogCollectionsSchema.parse(
    await handleResponse(await fetchWithTimeout(`${API_V1}/yschema/catalog/collections`))
  ).items;
}
export async function fetchSchemaIntroduction(
  reference: Pick<SchemaReleasePresentationReference, 'projectId' | 'commitDigest'> & {
    presentationDigest?: string;
  }
) {
  const query = reference.presentationDigest
    ? `?presentation_digest=${encodeURIComponent(reference.presentationDigest)}`
    : '';
  const result = StatePresentationResultSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/projects/${encodeURIComponent(reference.projectId)}/commits/${encodeURIComponent(reference.commitDigest)}/presentation${query}`
      )
    )
  );
  if (
    result.commitDigest !== reference.commitDigest ||
    (reference.presentationDigest && result.presentation?.digest !== reference.presentationDigest)
  ) {
    throw new Error('Introduction does not match the selected release');
  }
  return result.presentation;
}
