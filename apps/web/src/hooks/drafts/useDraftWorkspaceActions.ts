/**
 * useDraftWorkspaceActions — view-facing API for the workbench draft
 * full-screen workspace.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions live in
 * hooks. This hook owns the four async flows previously on
 * `draftWorkspaceStore`:
 *   - load(draftId)        → fetchWorkbenchDraft + seed all UI state
 *   - save()               → @/commands/drafts.updateWorkbenchDraft (PATCH w/ optimistic lock)
 *   - generatePreview()    → @/commands/drafts.previewWorkbenchDraft (auto-save first)
 *   - commit(message?)     → @/commands/drafts.commitWorkbenchDraft (auto-save first)
 *   - fork(sourceDraftId)  → @/commands/drafts.forkWorkbenchDraft (Iterate flow)
 *
 * The store exposes passive setters (setLoading, setLoadError,
 * setLoadedDraft, setSaveStarted, setSaveSucceeded, setSaveFailed,
 * setPreviewLoading, setPreviewSucceeded, setPreviewFailed,
 * setCommitting, setCommitFailed, setCommitted). Auto-preview
 * scheduling stays in the store (module-level timer).
 */

import { useCallback } from 'react';
import {
  commitWorkbenchDraft,
  forkWorkbenchDraft,
  previewWorkbenchDraft,
  updateWorkbenchDraft,
} from '@/commands/drafts';
import { formatUserFacingError } from '@/domain/format/errors';
import { ApiError } from '@/queries/apiErrors';
import { fetchWorkbenchDraft } from '@/queries/workbenchDrafts';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

export function useDraftWorkspaceActions() {
  const load = useCallback(async (draftId: string): Promise<void> => {
    useDraftWorkspaceStore.getState().setLoading();

    try {
      const draft = await fetchWorkbenchDraft(draftId);
      useDraftWorkspaceStore.getState().setLoadedDraft(draft);
    } catch (err) {
      const message = formatUserFacingError(err, 'Failed to load draft.');
      useDraftWorkspaceStore.getState().setLoadError(message);
    }
  }, []);

  const save = useCallback(async (): Promise<void> => {
    const { draftId, draft, isDirty } = useDraftWorkspaceStore.getState();
    if (!draftId || !draft || !isDirty || draft.status !== 'editing') return;

    useDraftWorkspaceStore.getState().setSaveStarted();

    try {
      const updated = await updateWorkbenchDraft(draftId, {
        title: draft.title,
        goal: draft.goal ?? undefined,
        nodes: draft.nodes,
        constraints: draft.constraints,
        instructions: draft.instructions ?? undefined,
        preview_type: draft.preview_type ?? undefined,
        target_branch: draft.target_branch ?? undefined,
        if_revision: draft.revision,
      });
      useDraftWorkspaceStore.getState().setSaveSucceeded(updated);
    } catch (err) {
      const isConflict =
        err instanceof ApiError && (err.code === 'CONFLICT' || err.message.includes('409'));
      useDraftWorkspaceStore.getState().setSaveFailed(isConflict);
    }
  }, []);

  const generatePreview = useCallback(async (): Promise<void> => {
    const { draftId, draft, isDirty, previewModel } = useDraftWorkspaceStore.getState();
    if (!draftId || !draft) return;

    // Generation counter — discard stale results
    const gen = useDraftWorkspaceStore.getState().bumpPreviewGeneration();

    if (isDirty) {
      await save();
      if (useDraftWorkspaceStore.getState().saveStatus === 'error') return;
    }

    if (gen !== useDraftWorkspaceStore.getState().previewGeneration) return;

    useDraftWorkspaceStore.getState().setPreviewLoading();

    try {
      const result = await previewWorkbenchDraft(draftId, {
        ...(previewModel ? { model: previewModel } : {}),
      });
      if (gen !== useDraftWorkspaceStore.getState().previewGeneration) return;

      const includedCount =
        useDraftWorkspaceStore.getState().draft?.nodes.filter((s) => s.included).length ?? 0;
      useDraftWorkspaceStore.getState().setPreviewSucceeded({
        output: result.output,
        tokenCount: result.token_count,
        modelUsed: result.model_used,
        cached: result.cached,
        includedCount,
      });
    } catch (err) {
      if (gen !== useDraftWorkspaceStore.getState().previewGeneration) return;
      const message = formatUserFacingError(err, 'Preview generation failed.');
      useDraftWorkspaceStore.getState().setPreviewFailed(message);
    }
  }, [save]);

  const commit = useCallback(
    async (
      message?: string
    ): Promise<{ commit: Record<string, unknown>; leaf: Record<string, unknown> | null }> => {
      const { draftId, draft, isDirty } = useDraftWorkspaceStore.getState();
      if (!draftId || !draft) throw new Error('No draft to commit');

      useDraftWorkspaceStore.getState().setCommitting();

      try {
        if (isDirty) {
          await save();
          if (useDraftWorkspaceStore.getState().saveStatus === 'error') {
            throw new Error('Failed to save draft before committing');
          }
        }

        const result = await commitWorkbenchDraft(draftId, message);
        useDraftWorkspaceStore.getState().setCommitted();
        return { commit: result.commit, leaf: result.leaf };
      } catch (err) {
        const errorMsg = formatUserFacingError(err, 'Failed to commit.');
        useDraftWorkspaceStore.getState().setCommitFailed(errorMsg);
        throw err;
      }
    },
    [save]
  );

  /**
   * Fork a committed draft into a new editable copy. Used by the
   * "Iterate" affordance on CommitDraftDialog. Components used to
   * dynamic-import this; the hook lifts it to a stable React surface
   * so views can call it without crossing the components -> commands
   * biome ban.
   */
  const fork = useCallback(async (sourceDraftId: string) => forkWorkbenchDraft(sourceDraftId), []);

  return { load, save, generatePreview, commit, fork };
}
