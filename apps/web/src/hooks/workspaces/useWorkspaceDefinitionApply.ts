'use client';

import { useCallback, useState } from 'react';
import { studioApplyCandidateIds } from '@/domain/workspaces/studioTargets';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import { applyStudioSelection, previewStudioSelection } from '@/infrastructure/schemaStudio';
import { fetchProjectWorkspaces } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

export function useWorkspaceDefinitionApply({
  candidate,
  onApplied,
  persistCandidate,
}: {
  candidate: WorkspaceCandidate;
  onApplied?: (workspace?: WorkspaceCandidate) => Promise<void> | void;
  persistCandidate?: (workspace: WorkspaceCandidate) => Promise<WorkspaceCandidate>;
}) {
  const studio = useStudioCandidates(candidate.projectId);
  const { extractCandidate, saveDraft, sendToYOps } = useWorkspaceFlow();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidateIds = studioApplyCandidateIds(studio.items);

  const apply = useCallback(async () => {
    if (applying) return false;
    setApplying(true);
    setError(null);
    try {
      if (candidateIds.length === 0) {
        throw new Error('Add a schema in Schemas first, then apply it here.');
      }

      let workspace = candidate;
      if (workspace.revision === undefined) {
        workspace = persistCandidate
          ? await persistCandidate(workspace)
          : (await saveDraft(workspace)).workspace;
      }
      if (workspace.revision === undefined) {
        throw new Error('Save the workspace draft before applying a schema.');
      }

      const preview = await previewStudioSelection(workspace.projectId, {
        candidateIds,
        workspaceId: workspace.id,
      });
      if (!preview.workspace) {
        throw new Error('The schema preview needs a saved workspace.');
      }
      if (!preview.report.valid) {
        throw new Error(
          preview.report.issues[0]?.message ?? 'The schema definition is not valid yet.'
        );
      }
      if (!preview.adoption.allowed) {
        throw new Error(
          preview.adoption.reason ?? 'This schema cannot be applied to the workspace.'
        );
      }

      await applyStudioSelection(workspace.projectId, {
        candidateIds,
        workspaceId: preview.workspace.id,
        ifRevision: preview.workspace.revision,
        reviewHash: preview.reviewHash,
      });
      const rebuilt = await rebuildWorkspaceDraftFromSources(workspace.projectId, workspace.id, {
        extractCandidate,
        sendToYOps,
      });
      await onApplied?.(rebuilt);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply the schema.');
      return false;
    } finally {
      setApplying(false);
    }
  }, [
    applying,
    candidate,
    candidateIds,
    extractCandidate,
    onApplied,
    persistCandidate,
    saveDraft,
    sendToYOps,
  ]);

  return {
    apply,
    applying,
    error,
    hasStudioSelection: candidateIds.length > 0,
    loading: studio.loading,
  };
}

async function rebuildWorkspaceDraftFromSources(
  projectId: string,
  workspaceId: string,
  flow: {
    extractCandidate: (workspace: WorkspaceCandidate) => Promise<{ workspace: WorkspaceCandidate }>;
    sendToYOps: (workspace: WorkspaceCandidate) => Promise<{ workspace: WorkspaceCandidate }>;
  }
) {
  const workspaces = await fetchProjectWorkspaces(projectId);
  let bound = workspaces.find((workspace) => workspace.id === workspaceId);
  if (!bound || bound.sourceBundle.length === 0 || bound.yopsDraft.operations.length > 0) {
    return bound;
  }

  const extracted = await flow.extractCandidate(bound);
  bound = extracted.workspace;
  if (bound.yopsDraft.operations.length === 0) {
    bound = (await flow.sendToYOps(bound)).workspace;
  }
  return bound;
}
