/**
 * Draft Workspace Store — passive.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions
 * (load, save, generatePreview, commit) live in
 * `hooks/useDraftWorkspaceActions`. This store owns:
 *  - state for the draft workspace (draft data, save/preview/commit status)
 *  - pure local mutations (toggleNode, updateTitle, addConstraint, ...)
 *  - passive setters the hook calls after each I/O resolves
 *  - module-level auto-preview debounce timer (cleaned up via reset())
 */

import { create } from 'zustand';
import { type ValidationResult, validateConstraintsLocally } from '@/lib/draftValidation';
import type { DraftConstraint, DraftNode, WorkbenchDraft } from '@/types/api';
import { createSaveStatusTimer, type SaveStatus } from './saveStatus';

type PreviewStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';

interface DraftWorkspaceState {
  // Data
  draftId: string | null;
  projectId: string | null;
  draft: WorkbenchDraft | null;

  // UI state
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  isDirty: boolean;
  lastSavedAt: Date | null;
  validationResults: ValidationResult[];
  conflictError: boolean;

  // Preview state
  previewOutput: string | null;
  previewGeneratedAt: string | null;
  previewStatus: PreviewStatus;
  previewError: string | null;
  previewTokenCount: number | null;
  previewModelUsed: string | null;
  previewCached: boolean;
  previewIncludedCount: number | null;
  previewGeneration: number;

  // V2: Auto preview + model selector
  autoPreview: boolean;
  previewModel: string | null;

  // ── Pure local mutations ──
  updateTitle: (title: string) => void;
  updateGoal: (goal: string) => void;
  toggleNode: (nodeId: string) => void;
  removeNode: (nodeId: string) => void;
  reorderNodes: (fromIndex: number, toIndex: number) => void;
  addManualNode: (text: string) => void;
  addConstraint: (
    type: 'require' | 'exclude',
    matchMode: 'exact' | 'semantic',
    value: string,
    reason?: string
  ) => void;
  removeConstraint: (constraintId: string) => void;
  updateInstructions: (instructions: string) => void;
  updatePreviewType: (previewType: string) => void;
  clearPreview: () => void;

  // V2: Settings
  setAutoPreview: (enabled: boolean) => void;
  setPreviewModel: (model: string | null) => void;

  // ── Passive setters used by useDraftWorkspaceActions ──
  setLoading: () => void;
  setLoadError: (message: string) => void;
  setLoadedDraft: (draft: WorkbenchDraft) => void;
  setSaveStarted: () => void;
  setSaveSucceeded: (updated: WorkbenchDraft) => void;
  setSaveFailed: (isConflict: boolean) => void;
  setPreviewLoading: () => void;
  setPreviewSucceeded: (result: {
    output: string;
    tokenCount: number;
    modelUsed: string;
    cached: boolean;
    includedCount: number;
  }) => void;
  setPreviewFailed: (message: string) => void;
  setCommitting: () => void;
  setCommitFailed: (message: string) => void;
  setCommitted: () => void;
  bumpPreviewGeneration: () => number;

  // Computed
  getIncludedCount: () => number;

  // Lifecycle
  reset: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function recomputeValidation(draft: WorkbenchDraft | null): ValidationResult[] {
  if (!draft) return [];
  return validateConstraintsLocally(draft.nodes, draft.constraints);
}

function nextId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${hex}`;
}

function staleIfReady(currentStatus: PreviewStatus): PreviewStatus {
  return currentStatus === 'ready' ? 'stale' : currentStatus;
}

/** Auto-preview debounce timer (module-level for cleanup across remounts) */
let autoPreviewTimer: ReturnType<typeof setTimeout> | null = null;
let autoPreviewCallback: (() => void) | null = null;

const saveTimer = createSaveStatusTimer();

function scheduleAutoPreview(get: () => DraftWorkspaceState, newPreviewStatus: PreviewStatus) {
  if (!get().autoPreview || newPreviewStatus !== 'stale') return;
  if (autoPreviewTimer) clearTimeout(autoPreviewTimer);
  autoPreviewTimer = setTimeout(() => {
    autoPreviewTimer = null;
    autoPreviewCallback?.();
  }, 2000);
}

/**
 * Wire the auto-preview callback once at app/workspace mount. The store
 * fires this callback when the debounce timer expires and a preview is
 * currently 'stale'. The callback should call useDraftWorkspaceActions.
 */
export function setAutoPreviewCallback(cb: (() => void) | null): void {
  autoPreviewCallback = cb;
}

const initialState = {
  draftId: null as string | null,
  projectId: null as string | null,
  draft: null as WorkbenchDraft | null,
  loading: false,
  error: null as string | null,
  saveStatus: 'idle' as SaveStatus,
  isDirty: false,
  lastSavedAt: null as Date | null,
  validationResults: [] as ValidationResult[],
  conflictError: false,
  previewOutput: null as string | null,
  previewGeneratedAt: null as string | null,
  previewStatus: 'idle' as PreviewStatus,
  previewError: null as string | null,
  previewTokenCount: null as number | null,
  previewModelUsed: null as string | null,
  previewCached: false,
  previewIncludedCount: null as number | null,
  previewGeneration: 0,
  autoPreview: false,
  previewModel: null as string | null,
};

export const useDraftWorkspaceStore = create<DraftWorkspaceState>((set, get) => ({
  ...initialState,

  // ── Pure mutations ──

  updateTitle: (title) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    set({ draft: { ...draft, title }, isDirty: true });
  },

  updateGoal: (goal) => {
    const { draft } = get();
    if (!draft || draft.status !== 'editing') return;
    set({ draft: { ...draft, goal: goal || null }, isDirty: true });
  },

  toggleNode: (nodeId) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const nodes = draft.nodes.map((s) => (s.id === nodeId ? { ...s, included: !s.included } : s));
    const updated = { ...draft, nodes };
    const newPreviewStatus = staleIfReady(previewStatus);
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: newPreviewStatus,
    });
    scheduleAutoPreview(get, newPreviewStatus);
  },

  removeNode: (nodeId) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const nodes = draft.nodes.filter((s) => s.id !== nodeId).map((s, i) => ({ ...s, position: i }));
    const updated = { ...draft, nodes };
    const newPreviewStatus = staleIfReady(previewStatus);
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: newPreviewStatus,
    });
    scheduleAutoPreview(get, newPreviewStatus);
  },

  reorderNodes: (fromIndex, toIndex) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const nodes = [...draft.nodes];
    const [moved] = nodes.splice(fromIndex, 1);
    nodes.splice(toIndex, 0, moved);
    const reindexed = nodes.map((s, i) => ({ ...s, position: i }));
    const updated = { ...draft, nodes: reindexed };
    const newPreviewStatus = staleIfReady(previewStatus);
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: newPreviewStatus,
    });
    scheduleAutoPreview(get, newPreviewStatus);
  },

  addManualNode: (text) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing' || !text.trim()) return;
    const newNode: DraftNode = {
      id: nextId('ds_'),
      text: text.trim(),
      origin: { type: 'manual' },
      position: draft.nodes.length,
      included: true,
    };
    const updated = { ...draft, nodes: [...draft.nodes, newNode] };
    const newPreviewStatus = staleIfReady(previewStatus);
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: newPreviewStatus,
    });
    scheduleAutoPreview(get, newPreviewStatus);
  },

  addConstraint: (type, matchMode, value, reason) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing' || !value.trim()) return;
    const newConstraint: DraftConstraint = {
      id: nextId('dc_'),
      type,
      match_mode: matchMode,
      value: value.trim(),
      ...(reason ? { reason } : {}),
    };
    const updated = { ...draft, constraints: [...draft.constraints, newConstraint] };
    const newPreviewStatus = staleIfReady(previewStatus);
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: newPreviewStatus,
    });
    scheduleAutoPreview(get, newPreviewStatus);
  },

  removeConstraint: (constraintId) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const updated = {
      ...draft,
      constraints: draft.constraints.filter((c) => c.id !== constraintId),
    };
    const newPreviewStatus = staleIfReady(previewStatus);
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: newPreviewStatus,
    });
    scheduleAutoPreview(get, newPreviewStatus);
  },

  updateInstructions: (instructions) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const updated = { ...draft, instructions: instructions || null };
    const newPreviewStatus = staleIfReady(previewStatus);
    set({ draft: updated, isDirty: true, previewStatus: newPreviewStatus });
    scheduleAutoPreview(get, newPreviewStatus);
  },

  updatePreviewType: (previewType) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const updated = { ...draft, preview_type: previewType || null };
    const newPreviewStatus = staleIfReady(previewStatus);
    set({ draft: updated, isDirty: true, previewStatus: newPreviewStatus });
    scheduleAutoPreview(get, newPreviewStatus);
  },

  clearPreview: () => {
    set({
      previewOutput: null,
      previewGeneratedAt: null,
      previewStatus: 'idle',
      previewError: null,
      previewTokenCount: null,
      previewModelUsed: null,
      previewCached: false,
      previewIncludedCount: null,
    });
  },

  setAutoPreview: (enabled) => {
    set({ autoPreview: enabled });
    if (!enabled && autoPreviewTimer) {
      clearTimeout(autoPreviewTimer);
      autoPreviewTimer = null;
    }
  },

  setPreviewModel: (model) => {
    set({ previewModel: model });
  },

  // ── Passive setters ──

  setLoading: () => set({ loading: true, error: null, conflictError: false }),
  setLoadError: (message) => set({ loading: false, error: message }),

  setLoadedDraft: (draft) => {
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
    set({
      draftId: draft.id,
      projectId: draft.project_id,
      draft,
      loading: false,
      isDirty: false,
      validationResults: recomputeValidation(draft),
      previewOutput,
      previewGeneratedAt,
      previewStatus,
      previewError: null,
      previewIncludedCount: previewOutput ? draft.nodes.filter((s) => s.included).length : null,
    });
  },

  setSaveStarted: () => set({ saveStatus: 'saving' }),
  setSaveSucceeded: (updated) => {
    set({
      draft: updated,
      saveStatus: 'saved',
      isDirty: false,
      lastSavedAt: new Date(),
      conflictError: false,
      validationResults: recomputeValidation(updated),
    });
    saveTimer.scheduleReset(get, set);
  },
  setSaveFailed: (isConflict) => set({ saveStatus: 'error', conflictError: isConflict }),

  setPreviewLoading: () => set({ previewStatus: 'loading', previewError: null }),
  setPreviewSucceeded: ({ output, tokenCount, modelUsed, cached, includedCount }) =>
    set({
      previewOutput: output,
      previewGeneratedAt: new Date().toISOString(),
      previewStatus: 'ready',
      previewTokenCount: tokenCount,
      previewModelUsed: modelUsed,
      previewCached: cached,
      previewError: null,
      previewIncludedCount: includedCount,
    }),
  setPreviewFailed: (message) => set({ previewStatus: 'error', previewError: message }),

  setCommitting: () => set({ error: null }),
  setCommitFailed: (message) => set({ error: message }),
  setCommitted: () => {
    const { draft } = get();
    if (!draft) return;
    set({ draft: { ...draft, status: 'committed' }, isDirty: false });
  },

  bumpPreviewGeneration: () => {
    const next = get().previewGeneration + 1;
    set({ previewGeneration: next });
    return next;
  },

  // Computed
  getIncludedCount: () => {
    const { draft } = get();
    if (!draft) return 0;
    return draft.nodes.filter((s) => s.included).length;
  },

  // Lifecycle
  reset: () => {
    if (autoPreviewTimer) {
      clearTimeout(autoPreviewTimer);
      autoPreviewTimer = null;
    }
    saveTimer.cancel();
    set(initialState);
  },
}));
