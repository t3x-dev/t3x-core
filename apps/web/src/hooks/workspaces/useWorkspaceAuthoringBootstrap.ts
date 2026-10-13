import { createRepositorySemanticState, type SemanticContent } from '@t3x-dev/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { validateWorkspaceCandidateYOps } from './useWorkspaceYOps';
export function useWorkspaceAuthoringBootstrap(
  candidate: WorkspaceCandidate,
  ensureSaved?: () => Promise<WorkspaceCandidate>,
  autoStart = false
) {
  const [active, setActive] = useState(Boolean(candidate.authoringLedger));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [importSnapshot, setImportSnapshot] =
    useState<ReturnType<typeof createRepositorySemanticState>['value']>();
  const requestId = useRef<string | undefined>(undefined);
  const workspaceKey = `${candidate.projectId}:${candidate.id}`;
  const currentKey = useRef(workspaceKey);
  currentKey.current = workspaceKey;
  const attempted = useRef<string | null>(null);
  const running = useRef<{ key: string; promise: Promise<boolean | undefined> } | null>(null);
  useEffect(() => {
    setActive(Boolean(candidate.authoringLedger));
    setImportSnapshot(undefined);
    setError(null);
    setBusy(false);
    requestId.current = undefined;
  }, [workspaceKey, candidate.authoringLedger]);
  const start = useCallback(() => {
    if (running.current?.key === workspaceKey) return running.current.promise;
    const run = async () => {
      setBusy(true);
      setError(null);
      try {
        const workspace = ensureSaved ? await ensureSaved() : candidate;
        if (currentKey.current !== workspaceKey) return;
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
          if (currentKey.current !== workspaceKey) return;
          setImportSnapshot(
            createRepositorySemanticState({
              trees: result.previewTrees,
              relations: result.previewRelations ?? [],
            } as SemanticContent).value
          );
          return;
        }
        requestId.current ??= crypto.randomUUID();
        const identity = requestId.current;
        const api = getSharedApiClient();
        const expectedRefHead =
          workspace.baseCommitHash ??
          (
            await api.listBranches(workspace.projectId, {
              limit: 100,
            })
          ).branches.find((branch) => branch.name === workspace.targetBranch)?.head_commit_hash ??
          null;
        if (currentKey.current !== workspaceKey) return;
        await api.workspaces.authoring.initialize(workspace.projectId, workspace.id, {
          request_id: identity,
          expected_workspace_revision: workspace.revision,
          expected_ref_head: expectedRefHead,
          ...(importSnapshot === undefined ? {} : { legacy_document: importSnapshot }),
        });
        if (currentKey.current !== workspaceKey) return;
        setActive(true);
        return true;
      } catch (error) {
        if (currentKey.current === workspaceKey)
          setError(error instanceof Error ? error.message : 'Cannot initialize Draft activity');
      } finally {
        if (currentKey.current === workspaceKey) setBusy(false);
      }
    };
    const promise = run();
    running.current = { key: workspaceKey, promise };
    void promise.finally(() => {
      if (running.current?.promise === promise) running.current = null;
    });
    return promise;
  }, [active, candidate, ensureSaved, importSnapshot, workspaceKey]);

  useEffect(() => {
    if (!autoStart || active || attempted.current === workspaceKey) return;
    attempted.current = workspaceKey;
    void start();
  }, [active, autoStart, start, workspaceKey]);
  return {
    active: active || Boolean(candidate.authoringLedger),
    busy,
    error,
    importSnapshot,
    start,
    cancel: () => setImportSnapshot(undefined),
  };
}
