import type { StateCreator } from 'zustand';
import type { CanvasState, MergeSlice } from './canvasStoreTypes';

/**
 * Merge slice — passive state + setters only.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions
 * (prepare + execute merge) live in `hooks/useCanvasMergeActions`.
 * This slice owns merge state and exposes setters that the hook
 * calls after the API resolves.
 */
export const createMergeSlice: StateCreator<CanvasState, [], [], MergeSlice> = (set) => ({
  mergeState: null,
  mergeLoading: false,
  mergeError: null,

  setMergeLoading: (loading) => set({ mergeLoading: loading }),
  setMergeError: (error) => set({ mergeError: error }),
  setMergePrepared: (mergeState) => set({ mergeState, mergeLoading: false, mergeError: null }),

  appendMergeCommit: (node, edges) =>
    set((state) => ({
      nodes: [...state.nodes, node],
      edges: [...state.edges, ...edges],
      mergeState: null,
      mergeLoading: false,
      mergeError: null,
    })),

  cancelMerge: () => set({ mergeState: null, mergeLoading: false, mergeError: null }),
  clearMergeError: () => set({ mergeError: null }),
});

// ============================================================================
// Merge Selectors
// ============================================================================

export const selectIsMerging = (state: CanvasState) => state.mergeState !== null;

export const selectCanExecuteMerge = (state: CanvasState) => {
  if (!state.mergeState) return false;
  return state.mergeState.prepared.conflicts.length === 0;
};

export const selectUnresolvedCount = (state: CanvasState) => {
  if (!state.mergeState) return 0;
  return state.mergeState.prepared.conflicts.length;
};

export const selectMergeCounts = (state: CanvasState) => {
  if (!state.mergeState) {
    return null;
  }
  const { prepared } = state.mergeState;
  return {
    identical: prepared.autoKept.length,
    similar: prepared.conflicts.length,
    onlyInSource: prepared.onlyInSource.length,
    onlyInTarget: prepared.onlyInTarget.length,
    resolved: 0,
  };
};
