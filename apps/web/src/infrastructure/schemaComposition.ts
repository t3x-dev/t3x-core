import type {
  ProjectSchemaVersionHistory,
  PublishedSchemaVersionManifest,
  PublishSchemaCompositionInput,
  SchemaCompositionDraft,
  SchemaCompositionPreviewResult,
  WorkspaceSchemaCompositionResult,
  YSchemaArtifactFamily,
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
  projectId?: string,
  family?: YSchemaArtifactFamily
): Promise<YSchemaArtifactRegistryPage> {
  const path = projectId
    ? `/projects/${encodeURIComponent(projectId)}/yschema/artifacts`
    : '/yschema/artifacts';
  const query = family ? `family=${encodeURIComponent(family)}&limit=100` : 'limit=100';
  const response = await fetchWithTimeout(`${API_V1}${path}?${query}`);
  return handleResponse(response);
}

export async function loadProjectYSchemaVersions(
  projectId: string,
  family?: YSchemaArtifactFamily
): Promise<ProjectSchemaVersionHistory> {
  const query = family ? `?family=${encodeURIComponent(family)}` : '';
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/yschema/versions${query}`
  );
  return handleResponse(response);
}

export async function updateProjectYSchemaIdentity(
  projectId: string,
  artifactId: string,
  input: {
    ifRevision: number;
    displayName?: string;
    description?: string;
    tags?: string[];
  }
): Promise<PublishedSchemaVersionManifest> {
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/yschemas/${encodeURIComponent(artifactId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        if_revision: input.ifRevision,
        display_name: input.displayName,
        description: input.description,
        tags: input.tags,
      }),
    }
  );
  return handleResponse(response);
}

export async function setProjectYSchemaLifecycle(
  projectId: string,
  artifactId: string,
  action: 'archive' | 'restore',
  ifRevision: number
): Promise<PublishedSchemaVersionManifest> {
  const response = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/yschemas/${encodeURIComponent(artifactId)}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ if_revision: ifRevision }),
    }
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
        ...(input.tags?.length ? { tags: input.tags } : {}),
      }),
    }
  );
  return handleResponse(response);
}
