/**
 * Draft Workspace Store
 *
 * Zustand store for managing the full-screen draft workspace state.
 * Handles draft persistence, auto-save, local validation, and commit flow.
 */

import { create } from 'zustand';
import type { DraftConstraint, DraftSentence, DraftV3 } from '@/lib/api';
import * as api from '@/lib/api';
import { type ValidationResult, validateConstraintsLocally } from '@/lib/draftValidation';
import { useCanvasStore } from './canvasStore';

// ============================================================================
// Types
// ============================================================================

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface DraftWorkspaceState {
  // Data
  draftId: string | null;
  projectId: string | null;
  draft: DraftV3 | null;

  // UI state
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  isDirty: boolean;
  lastSavedAt: Date | null;
  validationResults: ValidationResult[];
  conflictError: boolean;

  // Actions
  loadDraft: (draftId: string) => Promise<void>;

  // Mutations (set isDirty=true, recompute validations)
  updateTitle: (title: string) => void;
  updateGoal: (goal: string) => void;
  toggleSentence: (sentenceId: string) => void;
  removeSentence: (sentenceId: string) => void;
  reorderSentences: (fromIndex: number, toIndex: number) => void;
  addManualSentence: (text: string) => void;
  addConstraint: (
    type: 'require' | 'exclude',
    matchMode: 'exact' | 'semantic',
    value: string,
    reason?: string
  ) => void;
  removeConstraint: (constraintId: string) => void;
  updateInstructions: (instructions: string) => void;

  // Async
  saveDraft: () => Promise<void>;
  commitDraft: (
    message?: string
  ) => Promise<{ commit: Record<string, unknown>; leaf: Record<string, unknown> | null }>;

  // Computed
  getIncludedCount: () => number;

  // Lifecycle
  reset: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function recomputeValidation(draft: DraftV3 | null): ValidationResult[] {
  if (!draft) return [];
  return validateConstraintsLocally(draft.sentences, draft.constraints);
}

function nextId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${hex}`;
}

// ============================================================================
// Store
// ============================================================================

const initialState = {
  draftId: null as string | null,
  projectId: null as string | null,
  draft: null as DraftV3 | null,
  loading: false,
  error: null as string | null,
  saveStatus: 'idle' as SaveStatus,
  isDirty: false,
  lastSavedAt: null as Date | null,
  validationResults: [] as ValidationResult[],
  conflictError: false,
};

export const useDraftWorkspaceStore = create<DraftWorkspaceState>((set, get) => ({
  ...initialState,

  // ============================================================================
  // Load
  // ============================================================================

  loadDraft: async (draftId: string) => {
    set({ loading: true, error: null, conflictError: false });

    try {
      const draft = await api.getDraftV3(draftId);
      set({
        draftId: draft.id,
        projectId: draft.project_id,
        draft,
        loading: false,
        isDirty: false,
        validationResults: recomputeValidation(draft),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load draft';
      set({ loading: false, error: message });
    }
  },

  // ============================================================================
  // Mutations (all guard: draft must exist and be in 'editing' status)
  // ============================================================================

  updateTitle: (title: string) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    const updated = { ...draft, title };
    set({ draft: updated, isDirty: true });
  },

  updateGoal: (goal: string) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    const updated = { ...draft, goal: goal || null };
    set({ draft: updated, isDirty: true });
  },

  toggleSentence: (sentenceId: string) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    const sentences = draft.sentences.map((s) =>
      s.id === sentenceId ? { ...s, included: !s.included } : s
    );
    const updated = { ...draft, sentences };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
    });
  },

  removeSentence: (sentenceId: string) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    const sentences = draft.sentences
      .filter((s) => s.id !== sentenceId)
      .map((s, i) => ({ ...s, position: i }));
    const updated = { ...draft, sentences };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
    });
  },

  reorderSentences: (fromIndex: number, toIndex: number) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    const sentences = [...draft.sentences];
    const [moved] = sentences.splice(fromIndex, 1);
    sentences.splice(toIndex, 0, moved);
    const reindexed = sentences.map((s, i) => ({ ...s, position: i }));
    const updated = { ...draft, sentences: reindexed };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
    });
  },

  addManualSentence: (text: string) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing' || !text.trim()) return;
    const newSentence: DraftSentence = {
      id: nextId('ds_'),
      text: text.trim(),
      origin: { type: 'manual' },
      position: draft.sentences.length,
      included: true,
    };
    const sentences = [...draft.sentences, newSentence];
    const updated = { ...draft, sentences };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
    });
  },

  addConstraint: (type, matchMode, value, reason) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing' || !value.trim()) return;
    const newConstraint: DraftConstraint = {
      id: nextId('dc_'),
      type,
      match_mode: matchMode,
      value: value.trim(),
      ...(reason ? { reason } : {}),
    };
    const constraints = [...draft.constraints, newConstraint];
    const updated = { ...draft, constraints };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
    });
  },

  removeConstraint: (constraintId: string) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    const constraints = draft.constraints.filter((c) => c.id !== constraintId);
    const updated = { ...draft, constraints };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
    });
  },

  updateInstructions: (instructions: string) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    const updated = { ...draft, instructions: instructions || null };
    set({ draft: updated, isDirty: true });
  },

  // ============================================================================
  // Save (PATCH with optimistic lock)
  // ============================================================================

  saveDraft: async () => {
    const { draftId, draft, isDirty } = get();
    if (!draftId || !draft || !isDirty || draft.status !== 'editing') return;

    set({ saveStatus: 'saving' });

    try {
      const updated = await api.updateDraftV3(draftId, {
        title: draft.title,
        goal: draft.goal ?? undefined,
        sentences: draft.sentences,
        constraints: draft.constraints,
        instructions: draft.instructions ?? undefined,
        preview_type: draft.preview_type ?? undefined,
        target_branch: draft.target_branch ?? undefined,
        if_revision: draft.revision,
      });

      set({
        draft: updated,
        saveStatus: 'saved',
        isDirty: false,
        lastSavedAt: new Date(),
        conflictError: false,
        validationResults: recomputeValidation(updated),
      });

      // Reset to idle after 2 seconds
      setTimeout(() => {
        const current = get();
        if (current.saveStatus === 'saved') {
          set({ saveStatus: 'idle' });
        }
      }, 2000);
    } catch (err) {
      const isConflict =
        err instanceof api.ApiError && (err.code === 'CONFLICT' || err.message.includes('409'));
      set({
        saveStatus: 'error',
        conflictError: isConflict,
      });
    }
  },

  // ============================================================================
  // Commit
  // ============================================================================

  commitDraft: async (message?: string) => {
    const { draftId, draft } = get();
    if (!draftId || !draft) throw new Error('No draft to commit');

    set({ error: null });

    try {
      // Save any pending changes first
      if (get().isDirty) {
        await get().saveDraft();
        if (get().saveStatus === 'error') {
          throw new Error('Failed to save draft before committing');
        }
      }

      const result = await api.commitDraftV3(draftId, message);

      set({
        draft: { ...draft, status: 'committed' },
        isDirty: false,
      });

      // Reload canvas data
      const projectId = get().projectId;
      if (projectId) {
        useCanvasStore.getState().loadProjectData(projectId);
      }

      return { commit: result.commit, leaf: result.leaf };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to commit';
      set({ error: errorMsg });
      throw err;
    }
  },

  // ============================================================================
  // Computed
  // ============================================================================

  getIncludedCount: () => {
    const { draft } = get();
    if (!draft) return 0;
    return draft.sentences.filter((s) => s.included).length;
  },

  // ============================================================================
  // Lifecycle
  // ============================================================================

  reset: () => {
    set(initialState);
  },
}));
