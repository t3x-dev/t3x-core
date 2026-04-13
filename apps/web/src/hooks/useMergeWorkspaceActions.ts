/**
 * useMergeWorkspaceActions — view-facing API for the full-screen merge
 * workspace.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions live in
 * hooks. This hook owns the seven async flows previously on
 * `mergeWorkspaceStore`:
 *   - load(draftId)              → getMergeDraft + seed all fields
 *   - create(...)                → createMergeDraft
 *   - save()                     → saveMergeDraft (auto-save, optimistic)
 *   - commit(branch?)            → commitMergeDraft
 *   - cancel()                   → deleteMergeDraft + reset
 *   - fetchSourceContext(...)    → fetchTurnContext + cache
 *   - fetchServerChecks()        → getMergeDraftChecks
 *
 * The store retains state + passive setters (setLoading, setLoadError,
 * setDraftLoaded, setSaveStarted, setSaveSucceeded, setSaveFailed,
 * setCommitFailed, setCommitted, setContextLoading, setContextCached,
 * setServerChecks*).
 */

import { useCallback } from 'react';
import {
  commitMergeDraft,
  createMergeDraft,
  deleteMergeDraft,
  getMergeDraft,
  getMergeDraftChecks,
  saveMergeDraft,
} from '@/queries/mergeApi';
import { fetchTurnContext } from '@/queries/turnContext';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import type { ContentNode, TurnContextData } from '@/types/merge';

export function useMergeWorkspaceActions() {
  const load = useCallback(async (draftId: string): Promise<void> => {
    useMergeWorkspaceStore.getState().setLoading();
    try {
      const draft = await getMergeDraft(draftId);
      useMergeWorkspaceStore.getState().setDraftLoaded(draft);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load draft';
      useMergeWorkspaceStore.getState().setLoadError(message);
      throw err;
    }
  }, []);

  const create = useCallback(
    async (
      projectId: string,
      sourceHash: string,
      targetHash: string,
      sourceBranch?: string,
      targetBranch?: string
    ): Promise<string> => {
      useMergeWorkspaceStore.getState().setLoading();
      try {
        const draft = await createMergeDraft({
          project_id: projectId,
          source_hash: sourceHash,
          target_hash: targetHash,
          source_branch: sourceBranch,
          target_branch: targetBranch,
        });
        useMergeWorkspaceStore.getState().setDraftLoaded(draft);
        return draft.draftId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create draft';
        useMergeWorkspaceStore.getState().setLoadError(message);
        throw err;
      }
    },
    []
  );

  const save = useCallback(async (): Promise<void> => {
    const { draftId, treeMergeResult, message, isDirty, status } =
      useMergeWorkspaceStore.getState();
    if (!draftId || !isDirty || status === 'committed') return;

    useMergeWorkspaceStore.getState().setSaveStarted();

    try {
      await saveMergeDraft(draftId, { prepared: treeMergeResult ?? undefined, message });
      useMergeWorkspaceStore.getState().setSaveSucceeded();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save';
      console.warn('[useMergeWorkspaceActions] Auto-save failed:', errorMsg);
      useMergeWorkspaceStore.getState().setSaveFailed();
    }
  }, []);

  const commit = useCallback(async (branch?: string): Promise<{ hash: string }> => {
    const { draftId, message, targetBranch } = useMergeWorkspaceStore.getState();
    if (!draftId) throw new Error('No draft to commit');

    useMergeWorkspaceStore.getState().clearError();

    try {
      const commitResult = await commitMergeDraft(draftId, {
        message,
        branch: branch || targetBranch || 'main',
      });
      useMergeWorkspaceStore.getState().setCommitted();
      return commitResult;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to commit';
      useMergeWorkspaceStore.getState().setCommitFailed(errorMsg);
      throw err;
    }
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    const { draftId } = useMergeWorkspaceStore.getState();
    if (!draftId) return;

    try {
      await deleteMergeDraft(draftId);
    } catch {
      // Ignore — fire-and-forget cancellation
    }
    useMergeWorkspaceStore.getState().reset();
  }, []);

  const fetchSourceContext = useCallback(
    async (turnHash: string, node: ContentNode): Promise<TurnContextData | null> => {
      const { contextCache, contextLoadingStates } = useMergeWorkspaceStore.getState();

      if (contextCache[turnHash]) {
        return contextCache[turnHash].data;
      }
      if (contextLoadingStates[turnHash]) {
        return null;
      }

      useMergeWorkspaceStore.getState().setContextLoading(turnHash, true);

      try {
        const contextData = await fetchTurnContext(turnHash, {
          before: 1,
          after: 1,
          highlightStart: node.source?.start_char,
          highlightEnd: node.source?.end_char,
        });
        useMergeWorkspaceStore.getState().setContextCached(turnHash, contextData);
        return contextData;
      } catch {
        useMergeWorkspaceStore.getState().setContextLoading(turnHash, false);
        return null;
      }
    },
    []
  );

  const fetchServerChecks = useCallback(async (): Promise<void> => {
    const { draftId } = useMergeWorkspaceStore.getState();
    if (!draftId) return;

    useMergeWorkspaceStore.getState().setServerChecksLoading();
    try {
      const result = await getMergeDraftChecks(draftId);
      useMergeWorkspaceStore.getState().setServerChecksSucceeded(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch server checks';
      useMergeWorkspaceStore.getState().setServerChecksFailed(message);
    }
  }, []);

  return { load, create, save, commit, cancel, fetchSourceContext, fetchServerChecks };
}
