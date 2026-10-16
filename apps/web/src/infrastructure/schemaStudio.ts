import {
  type AddStudioCandidate,
  type SaveStudioSchemaEditCandidateInput,
  StudioAdoptResultSchema,
  type StudioApplyInput,
  StudioCandidateListSchema,
  StudioCandidateSchema,
  StudioSchemaEditCandidateSaveResultSchema,
  StudioSchemaEditCandidateSchema,
  WorkspaceSchemaPendingViewSchema,
} from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export async function publishStudioSchema(
  projectId: string,
  workspaceId: string,
  input: import('@t3x-dev/api-client').StudioPublishInput
) {
  const { StudioPublishResultSchema } = await import('@t3x-dev/api-client');
  return StudioPublishResultSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/publish/${encodeURIComponent(workspaceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      )
    )
  );
}

export async function previewSchemaContentPreparation(
  projectId: string,
  workspaceId: string,
  input: import('@t3x-dev/api-client').SchemaPreparationInput
) {
  const { SchemaPreparationPreviewSchema } = await import('@t3x-dev/api-client');
  return SchemaPreparationPreviewSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/preparation/${encodeURIComponent(workspaceId)}/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      )
    )
  );
}

export async function applySchemaContentPreparation(
  projectId: string,
  workspaceId: string,
  input: import('@t3x-dev/api-client').SchemaPreparationApplyInput
) {
  const { SchemaPreparationResultSchema } = await import('@t3x-dev/api-client');
  return SchemaPreparationResultSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/preparation/${encodeURIComponent(workspaceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      )
    )
  );
}

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

const schemaEditPath = (projectId: string, workspaceId: string) =>
  `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/edit-candidates/${encodeURIComponent(workspaceId)}`;

export async function readStudioSchemaEditCandidate(projectId: string, workspaceId: string) {
  const response = await fetchWithTimeout(schemaEditPath(projectId, workspaceId));
  if (response.status === 404) return null;
  return StudioSchemaEditCandidateSchema.parse(await handleResponse(response));
}

export async function saveStudioSchemaEditCandidate(
  projectId: string,
  workspaceId: string,
  input: SaveStudioSchemaEditCandidateInput
) {
  return StudioSchemaEditCandidateSaveResultSchema.parse(
    await handleResponse(
      await fetchWithTimeout(schemaEditPath(projectId, workspaceId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    )
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
export async function applyStudioSelection(projectId: string, input: StudioApplyInput) {
  return StudioAdoptResultSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      )
    )
  );
}

export async function readWorkspaceSchemaPending(projectId: string, workspaceId: string) {
  return WorkspaceSchemaPendingViewSchema.parse(
    await handleResponse(
      await fetchWithTimeout(
        `${API_V1}/projects/${encodeURIComponent(projectId)}/schema-studio/pending/${encodeURIComponent(workspaceId)}`,
        { cache: 'no-store' }
      )
    )
  );
}
