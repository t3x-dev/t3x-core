import { T3xApiError, type WorkspaceAuthoringCapability } from '@t3x-dev/api-client';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { getSharedApiClient } from './sharedApiClient';

export async function ensureSchemaAuthoring(projectId: string, workspaceId: string) {
  const api = getSharedApiClient().workspaces;
  const saved = await api.get(projectId, workspaceId);
  const workspace = saved.workspace as unknown as WorkspaceCandidate;
  if (!workspace.authoringLedger) {
    if (workspace.revision === undefined) throw new Error('Workspace revision is unavailable.');
    await api.authoring.initialize(projectId, workspaceId, {
      request_id: crypto.randomUUID(),
      expected_workspace_revision: workspace.revision,
      expected_ref_head: workspace.baseCommitHash,
    });
  }
}

export type SchemaWorkspaceReviewInput = Parameters<
  WorkspaceAuthoringCapability['prepareReview']
>[2];

export function readSchemaWorkspaceReviewDraft(projectId: string, workspaceId: string) {
  return getSharedApiClient().workspaces.authoring.read(projectId, workspaceId);
}

export async function readLatestSchemaWorkspaceReview(
  projectId: string,
  workspaceId: string,
  transitionId?: string
) {
  try {
    return await getSharedApiClient().workspaces.getLatestReviewSnapshot(
      projectId,
      workspaceId,
      transitionId ? { transition_id: transitionId } : undefined
    );
  } catch (error) {
    if (error instanceof T3xApiError && error.status === 404) return null;
    throw error;
  }
}

/** Request facts belong to the caller's exact Draft attempt and are reused on retry. */
export function prepareSchemaWorkspaceReview(
  projectId: string,
  workspaceId: string,
  input: SchemaWorkspaceReviewInput
) {
  return getSharedApiClient().workspaces.authoring.prepareReview(projectId, workspaceId, input);
}
