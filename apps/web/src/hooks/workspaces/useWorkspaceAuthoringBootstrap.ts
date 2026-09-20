import { createRepositorySemanticState, type SemanticContent } from '@t3x-dev/core';
import { useEffect, useRef, useState } from 'react';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { validateWorkspaceCandidateYOps } from './useWorkspaceYOps';
export function useWorkspaceAuthoringBootstrap(candidate: WorkspaceCandidate) {
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
      if (!candidate.revision)
        throw new Error('Save this Workspace before enabling Draft activity');
      if (candidate.yopsDraft.operations.length > 0 && importSnapshot === undefined) {
        const result = await validateWorkspaceCandidateYOps(candidate);
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
      await getSharedApiClient().workspaces.authoring.initialize(
        candidate.projectId,
        candidate.id,
        {
          request_id: requestId.current,
          expected_workspace_revision: candidate.revision,
          expected_ref_head: candidate.baseCommitHash,
          ...(importSnapshot === undefined ? {} : { legacy_document: importSnapshot }),
        }
      );
      setActive(true);
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
