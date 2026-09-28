import { createRepositorySemanticState, type SemanticContent } from '@t3x-dev/core';
import { useEffect, useRef, useState } from 'react';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { validateWorkspaceCandidateYOps } from './useWorkspaceYOps';
export function useWorkspaceAuthoringBootstrap(
  candidate: WorkspaceCandidate,
  ensureSaved?: () => Promise<WorkspaceCandidate>
) {
  const [active, setActive] = useState(Boolean(candidate.authoringLedger));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [importSnapshot, setImportSnapshot] =
    useState<ReturnType<typeof createRepositorySemanticState>['value']>();
  const requestId = useRef<string | undefined>(undefined);
  useEffect(() => {
    setActive(Boolean(candidate.authoringLedger));
    setImportSnapshot(undefined);
    setError(null);
    requestId.current = undefined;
  }, [candidate.id, candidate.authoringLedger]);
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const workspace = ensureSaved ? await ensureSaved() : candidate;
      if (workspace.revision === undefined)
        throw new Error('Unable to save this Workspace before enabling Draft activity');
      if (active || workspace.authoringLedger) {
        setActive(true);
        return true;
      }
      if (workspace.yopsDraft.operations.length > 0 && importSnapshot === undefined) {
        const result = await validateWorkspaceCandidateYOps(workspace);
        if (!result.ok || !result.previewTrees)
          throw new Error(
            'Resolve the current Draft validation error before importing its snapshot'
          );
        setImportSnapshot(
          createRepositorySemanticState({
            trees: result.previewTrees,
            relations: result.previewRelations ?? [],
          } as SemanticContent).value
        );
        return;
      }
      requestId.current ??= crypto.randomUUID();
      const api = getSharedApiClient();
      const expectedRefHead =
        workspace.baseCommitHash ??
        (
          await api.listBranches(workspace.projectId, {
            limit: 100,
          })
        ).branches.find((branch) => branch.name === workspace.targetBranch)?.head_commit_hash ??
        null;
      await api.workspaces.authoring.initialize(workspace.projectId, workspace.id, {
        request_id: requestId.current,
        expected_workspace_revision: workspace.revision,
        expected_ref_head: expectedRefHead,
        ...(importSnapshot === undefined ? {} : { legacy_document: importSnapshot }),
      });
      setActive(true);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Cannot initialize Draft activity');
    } finally {
      setBusy(false);
    }
  }
  return {
    active: active || Boolean(candidate.authoringLedger),
    busy,
    error,
    importSnapshot,
    start,
    cancel: () => setImportSnapshot(undefined),
  };
}
