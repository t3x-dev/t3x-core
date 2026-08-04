import type {
  ProjectSchemaVersionHistory,
  PublishedSchemaVersionManifest,
  PublishSchemaCompositionInput,
  SchemaCompositionDraft,
  SchemaCompositionPreviewResult,
  WorkspaceSchemaCompositionResult,
  YSchemaArtifactRegistryPage,
} from '@/types/schemaModules';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export async function previewYSchemaComposition(
  composition: SchemaCompositionDraft,
  projectId?: string
): Promise<SchemaCompositionPreviewResult> {
  const path = projectId
    ? `/projects/${encodeURIComponent(projectId)}/yschema/compositions/preview`
    : '/yschema/compositions/preview';
  const response = await fetchWithTimeout(`${API_V1}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(composition),
  });
  return handleResponse(response);
}

export async function loadYSchemaArtifactRegistry(
  projectId?: string
): Promise<YSchemaArtifactRegistryPage> {
  const path = projectId
    ? `/projects/${encodeURIComponent(projectId)}/yschema/artifacts`
    : '/yschema/artifacts';
  const response = await fetchWithTimeout(`${API_V1}${path}?family=prd&limit=100`);
  return handleResponse(response);
}

export async function loadProjectYSchemaVersions(
  projectId: string
): Promise<ProjectSchemaVersionHistory> {
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/yschema/versions?family=prd`
  );
  return handleResponse(response);
}

export async function loadWorkspaceYSchemaComposition(
  projectId: string,
  workspaceId: string
): Promise<WorkspaceSchemaCompositionResult> {
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/schema-composition`
  );
  return handleResponse(response);
}

export async function saveWorkspaceYSchemaComposition(
  projectId: string,
  workspaceId: string,
  composition: SchemaCompositionDraft,
  workspaceRevision: number
): Promise<WorkspaceSchemaCompositionResult> {
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/schema-composition`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition, if_revision: workspaceRevision }),
    }
  );
  return handleResponse(response);
}

export async function applyWorkspaceYSchemaComposition(
  projectId: string,
  workspaceId: string,
  workspaceRevision: number,
  compositionRevision: number,
  compositionHash: string
): Promise<WorkspaceSchemaCompositionResult> {
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/schema-composition/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        if_revision: workspaceRevision,
        composition_revision: compositionRevision,
        composition_hash: compositionHash,
      }),
    }
  );
  return handleResponse(response);
}

export async function publishWorkspaceYSchemaComposition(
  projectId: string,
  workspaceId: string,
  input: PublishSchemaCompositionInput
): Promise<PublishedSchemaVersionManifest> {
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(
      workspaceId
    )}/schema-composition/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        composition_revision: input.compositionRevision,
        composition_hash: input.compositionHash,
        canonical_name: input.canonicalName,
        version: input.version,
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.releaseNotes ? { release_notes: input.releaseNotes } : {}),
      }),
    }
  );
  return handleResponse(response);
}
