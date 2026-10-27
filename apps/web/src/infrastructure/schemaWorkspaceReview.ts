import { schemaReviewHref } from '@/domain/schemas/schemaNavigation';
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

/** The same complete, immutable Review used by Workspace, including Schema-only changes. */
export async function prepareSchemaWorkspaceReview(projectId: string, workspaceId: string) {
  const api = getSharedApiClient().workspaces;
  const draft = await api.authoring.read(projectId, workspaceId);
  if (draft.hasChanges === false)
    throw new Error('No changes to commit. Schema and content match the Base.');
  const reviewed = await api.authoring.prepareReview(projectId, workspaceId, {
    request_id: crypto.randomUUID(),
    expected_workspace_revision: draft.workspaceRevision,
    expected_revision: draft.compositionRevision,
    expected_ref_head: draft.basis.refHead,
    reason: 'Review Schema changes and the complete Workspace Draft.',
  });
  const saved = await api.getLatestReviewSnapshot(projectId, workspaceId, {
    transition_id: reviewed.view.transition_id,
  });
  if (!saved?.snapshot) throw new Error('The saved Review is unavailable. Retry Review.');
  return schemaReviewHref(projectId, workspaceId, saved.snapshot.snapshotId, draft.basis.refName);
}
