import { hasUnappliedSchemaEdit } from '@/domain/workspaces/schemaBindings';
import type { WorkspaceCandidate } from '@/types/workspaces';
import {
  listStudioCandidates,
  previewStudioSelection,
  readStudioSchemaEditCandidate,
} from './schemaStudio';
import { getSharedApiClient } from './sharedApiClient';

/** Resume the existing candidate; never replace Studio work with a new editing base. */
export async function readWorkspaceSchemaEditing(
  projectId: string,
  workspaceId: string,
  selectedCandidateIds?: string[]
) {
  const [saved, edit] = await Promise.all([
    getSharedApiClient().workspaces.get(projectId, workspaceId),
    readStudioSchemaEditCandidate(projectId, workspaceId),
  ]);
  const workspace = saved.workspace as unknown as WorkspaceCandidate;
  const unapplied = hasUnappliedSchemaEdit(edit, workspace);
  const binding = workspace.schemaBindings[0];
  let candidateIds: string[] = selectedCandidateIds ?? [];
  if (
    selectedCandidateIds === undefined &&
    unapplied &&
    edit &&
    edit.authoringDraft?.base.schemaHash !== binding?.schemaHash
  ) {
    const sources = await listStudioCandidates(projectId);
    candidateIds = edit.baseSources.map((base) => {
      const found = sources.find(
        (item) =>
          item.available &&
          item.source?.artifactVersionId === base.artifactVersionId &&
          item.source?.hash === base.hash &&
          item.source?.projectId === base.projectId
      );
      if (!found)
        throw new Error(
          `Restore Schema source ${base.canonicalName} @ ${base.version} in Studio before editing this candidate.`
        );
      return found.id;
    });
  }
  const preview = await previewStudioSelection(projectId, {
    workspaceId,
    candidateIds,
    ...(unapplied && edit
      ? { schemaEditCandidate: { candidateId: edit.candidateId, revision: edit.revision } }
      : {}),
  });
  if (!preview.workspace || preview.workspace.revision !== workspace.revision)
    throw new Error('Workspace changed while loading Schema. Refresh before editing.');
  return { workspace, edit, unapplied, candidateIds, preview };
}

export type WorkspaceSchemaEditing = Awaited<ReturnType<typeof readWorkspaceSchemaEditing>>;
