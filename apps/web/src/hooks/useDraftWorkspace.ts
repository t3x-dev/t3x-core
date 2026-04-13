/**
 * useDraftWorkspace — view-facing API for the draft workspace I/O.
 *
 * Owns the 4 async actions that used to live inside draftWorkspaceStore
 * (loadDraft / saveDraft / commitDraft / generatePreview). Store is now
 * passive (v2 §2.5). Auto-preview scheduling has moved to the calling
 * component (DraftWorkspace.tsx) — it already owns auto-save and can
 * schedule preview alongside it via useEffect.
 *
 * The preview-generation guard lives at module scope so navigation/remount
 * cannot race with an in-flight preview response.
 */

import { useCallback } from 'react';
import {
  commitWorkbenchDraft,
  forkWorkbenchDraft,
  previewWorkbenchDraft,
  updateWorkbenchDraft,
} from '@/commands/drafts';
import { ApiError } from '@/queries/apiErrors';
import { fetchWorkbenchDraft } from '@/queries/workbenchDrafts';
import { type PreviewStatus, saveTimer, useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

let previewGeneration = 0;

export function useDraftWorkspace() {
  const loadDraft = useCallback(async (draftId: string): Promise<void> => {
    const s = useDraftWorkspaceStore.getState();
    s.setLoading(true);
    s.setError(null);
    s.setConflictError(false);

    try {
      const draft = await fetchWorkbenchDraft(draftId);

      let previewStatus: PreviewStatus = 'idle';
      let previewOutput: string | null = null;
      let previewGeneratedAt: string | null = null;
      if (draft.preview_output && draft.preview_generated_at) {
        previewOutput = draft.preview_output;
        previewGeneratedAt = draft.preview_generated_at;
        const genTime = new Date(draft.preview_generated_at).getTime();
        const updTime = new Date(draft.updated_at).getTime();
        previewStatus = genTime < updTime ? 'stale' : 'ready';
      }

      useDraftWorkspaceStore.getState().applyLoadedDraft({
        draft,
        previewOutput,
        previewGeneratedAt,
        previewStatus,
        previewIncludedCount: previewOutput ? draft.nodes.filter((n) => n.included).length : null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load draft';
      const store = useDraftWorkspaceStore.getState();
      store.setLoading(false);
      store.setError(message);
    }
  }, []);

  const saveDraft = useCallback(async (): Promise<void> => {
    const { draftId, draft, isDirty } = useDraftWorkspaceStore.getState();
    if (!draftId || !draft || !isDirty || draft.status !== 'editing') return;

    const store = useDraftWorkspaceStore.getState();
    store.setSaveStatus('saving');

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

      useDraftWorkspaceStore.getState().applySavedDraft(updated, new Date());

      saveTimer.scheduleReset(
        () => useDraftWorkspaceStore.getState(),
        (patch) => useDraftWorkspaceStore.setState(patch)
      );
    } catch (err) {
      const isConflict =
        err instanceof ApiError && (err.code === 'CONFLICT' || err.message.includes('409'));
      const s = useDraftWorkspaceStore.getState();
      s.setSaveStatus('error');
      s.setConflictError(isConflict);
    }
  }, []);

  const generatePreview = useCallback(async (): Promise<void> => {
    const { draftId, draft, isDirty, previewModel } = useDraftWorkspaceStore.getState();
    if (!draftId || !draft) return;

    const gen = ++previewGeneration;

    if (isDirty) {
      await saveDraft();
      if (useDraftWorkspaceStore.getState().saveStatus === 'error') return;
    }

    if (gen !== previewGeneration) return;

    useDraftWorkspaceStore.getState().setPreviewStatus('loading');

    try {
      const result = await previewWorkbenchDraft(draftId, {
        ...(previewModel ? { model: previewModel } : {}),
      });
      if (gen !== previewGeneration) return;

      const includedCount =
        useDraftWorkspaceStore.getState().draft?.nodes.filter((s) => s.included).length ?? 0;
      useDraftWorkspaceStore.getState().applyPreviewResult({
        output: result.output,
        tokenCount: result.token_count,
        modelUsed: result.model_used,
        cached: result.cached,
        includedCount,
      });
    } catch (err) {
      if (gen !== previewGeneration) return;
      const message = err instanceof Error ? err.message : 'Preview generation failed';
      useDraftWorkspaceStore.getState().setPreviewError(message);
    }
  }, [saveDraft]);

  const commitDraft = useCallback(
    async (message?: string) => {
      const { draftId, draft } = useDraftWorkspaceStore.getState();
      if (!draftId || !draft) throw new Error('No draft to commit');

      useDraftWorkspaceStore.getState().setError(null);

      try {
        if (useDraftWorkspaceStore.getState().isDirty) {
          await saveDraft();
          if (useDraftWorkspaceStore.getState().saveStatus === 'error') {
            throw new Error('Failed to save draft before committing');
          }
        }

        const result = await commitWorkbenchDraft(draftId, message);

        useDraftWorkspaceStore.getState().setDraftStatus('committed');

        return { commit: result.commit, leaf: result.leaf };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to commit';
        useDraftWorkspaceStore.getState().setError(errorMsg);
        throw err;
      }
    },
    [saveDraft]
  );

  const forkDraft = useCallback(async (sourceDraftId: string) => {
    return forkWorkbenchDraft(sourceDraftId);
  }, []);

  return { loadDraft, saveDraft, generatePreview, commitDraft, forkDraft };
}
