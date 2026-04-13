/**
 * Draft Workspace Store (passive, v2 §2.5)
 *
 * Pure state + setters + local (pure) mutations. I/O actions
 * (loadDraft / saveDraft / commitDraft / generatePreview) live in
 * hooks/useDraftWorkspace, which composes the migrated orchestration
 * (auto-preview scheduling, save-status timer, stale-generation guard).
 */

import { create } from 'zustand';
import { type ValidationResult, validateConstraintsLocally } from '@/lib/draftValidation';
import type { DraftConstraint, DraftNode, WorkbenchDraft } from '@/types/api';
import { createSaveStatusTimer, type SaveStatus } from './saveStatus';

export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';

export interface DraftWorkspaceState {
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

  // V2: Auto preview + model selector
  autoPreview: boolean;
  previewModel: string | null; // null = server default (haiku)

  // Pure mutations (no I/O). Still guard: draft must exist + be 'editing'.
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

  // V2: Settings (pure)
  setAutoPreview: (enabled: boolean) => void;
  setPreviewModel: (model: string | null) => void;

  // Setters consumed by hooks/useDraftWorkspace (no I/O here).
  setLoading: (flag: boolean) => void;
  setError: (err: string | null) => void;
  setConflictError: (flag: boolean) => void;
  applyLoadedDraft: (payload: {
    draft: WorkbenchDraft;
    previewOutput: string | null;
    previewGeneratedAt: string | null;
    previewStatus: PreviewStatus;
    previewIncludedCount: number | null;
  }) => void;
  applySavedDraft: (draft: WorkbenchDraft, savedAt: Date) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setDraftStatus: (status: WorkbenchDraft['status']) => void;
  setPreviewStatus: (status: PreviewStatus) => void;
  applyPreviewResult: (payload: {
    output: string;
    tokenCount: number;
    modelUsed: string;
    cached: boolean;
    includedCount: number;
  }) => void;
  setPreviewError: (message: string) => void;

  // Computed (pure)
  getIncludedCount: () => number;

  // Lifecycle
  reset: () => void;
}

// ============================================================================
// Helpers (pure)
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

/** If preview was 'ready', mark it as 'stale' after content mutations */
function staleIfReady(currentStatus: PreviewStatus): PreviewStatus {
  return currentStatus === 'ready' ? 'stale' : currentStatus;
}

export const saveTimer = createSaveStatusTimer();

// ============================================================================
// Store
// ============================================================================

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
  autoPreview: false,
  previewModel: null as string | null,
};

export const useDraftWorkspaceStore = create<DraftWorkspaceState>((set, get) => ({
  ...initialState,

  // ── Pure mutations ────────────────────────────────────────────────────────

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
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: staleIfReady(previewStatus),
    });
  },

  removeNode: (nodeId) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const nodes = draft.nodes.filter((s) => s.id !== nodeId).map((s, i) => ({ ...s, position: i }));
    const updated = { ...draft, nodes };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: staleIfReady(previewStatus),
    });
  },

  reorderNodes: (fromIndex, toIndex) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const nodes = [...draft.nodes];
    const [moved] = nodes.splice(fromIndex, 1);
    nodes.splice(toIndex, 0, moved);
    const reindexed = nodes.map((s, i) => ({ ...s, position: i }));
    const updated = { ...draft, nodes: reindexed };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: staleIfReady(previewStatus),
    });
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
    const nodes = [...draft.nodes, newNode];
    const updated = { ...draft, nodes };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: staleIfReady(previewStatus),
    });
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
    const constraints = [...draft.constraints, newConstraint];
    const updated = { ...draft, constraints };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: staleIfReady(previewStatus),
    });
  },

  removeConstraint: (constraintId) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    const constraints = draft.constraints.filter((c) => c.id !== constraintId);
    const updated = { ...draft, constraints };
    set({
      draft: updated,
      isDirty: true,
      validationResults: recomputeValidation(updated),
      previewStatus: staleIfReady(previewStatus),
    });
  },

  updateInstructions: (instructions) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    set({
      draft: { ...draft, instructions: instructions || null },
      isDirty: true,
      previewStatus: staleIfReady(previewStatus),
    });
  },

  updatePreviewType: (previewType) => {
    const { draft, previewStatus } = get();
    if (!draft || draft.status !== 'editing') return;
    set({
      draft: { ...draft, preview_type: previewType || null },
      isDirty: true,
      previewStatus: staleIfReady(previewStatus),
    });
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

  setAutoPreview: (enabled) => set({ autoPreview: enabled }),
  setPreviewModel: (model) => set({ previewModel: model }),

  // ── Setters used by the hook ─────────────────────────────────────────────

  setLoading: (flag) => set({ loading: flag }),
  setError: (err) => set({ error: err }),
  setConflictError: (flag) => set({ conflictError: flag }),

  applyLoadedDraft: ({
    draft,
    previewOutput,
    previewGeneratedAt,
    previewStatus,
    previewIncludedCount,
  }) => {
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
      previewIncludedCount,
    });
  },

  applySavedDraft: (draft, savedAt) =>
    set({
      draft,
      saveStatus: 'saved',
      isDirty: false,
      lastSavedAt: savedAt,
      conflictError: false,
      validationResults: recomputeValidation(draft),
    }),

  setSaveStatus: (status) => set({ saveStatus: status }),

  setDraftStatus: (status) => {
    const { draft } = get();
    if (!draft) return;
    set({ draft: { ...draft, status }, isDirty: false });
  },

  setPreviewStatus: (status) => set({ previewStatus: status, previewError: null }),

  applyPreviewResult: ({ output, tokenCount, modelUsed, cached, includedCount }) =>
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

  setPreviewError: (message) => set({ previewStatus: 'error', previewError: message }),

  // ── Computed ─────────────────────────────────────────────────────────────

  getIncludedCount: () => {
    const { draft } = get();
    if (!draft) return 0;
    return draft.nodes.filter((s) => s.included).length;
  },

  // ── Lifecycle ────────────────────────────────────────────────────────────

  reset: () => {
    saveTimer.cancel();
    set(initialState);
  },
}));
