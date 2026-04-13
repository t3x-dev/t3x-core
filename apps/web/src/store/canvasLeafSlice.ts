import type { StateCreator } from 'zustand';
import type { EmbeddedLeaf } from '../types/nodes';
import type { CanvasState, LeafPanelSlice } from './canvasStoreTypes';

/**
 * Leaf panel slice — panel UI state + node-data setters.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions (the API
 * calls for creating and deleting leaves) live in
 * `hooks/useCanvasLeafActions`. This slice only holds state and
 * state-only setters. Node-data mutation is done via two setters
 * (embedLeafInNode, removeLeafFromNodeState) which the hook calls
 * after the API resolves.
 */
export const createLeafSlice: StateCreator<CanvasState, [], [], LeafPanelSlice> = (set) => ({
  // Initial state
  leafPanelOpen: false,
  leafPanelCommitId: undefined,
  leafCreating: false,

  // Panel setters
  openLeafPanel: (commitId) => set({ leafPanelOpen: true, leafPanelCommitId: commitId }),
  closeLeafPanel: () => set({ leafPanelOpen: false, leafPanelCommitId: undefined }),
  setLeafCreating: (leafCreating) => set({ leafCreating }),

  // Node-data setters used by useCanvasLeafActions after API resolves
  embedLeafInNode: (commitNodeId: string, leaf: EmbeddedLeaf) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== commitNodeId) return node;
        const existingLeaves = node.data.leaves || [];
        return {
          ...node,
          data: { ...node.data, leaves: [...existingLeaves, leaf] },
        };
      }),
    })),

  removeLeafFromNodeState: (commitNodeId: string, leafId: string) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== commitNodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            leaves: (node.data.leaves || []).filter((l) => l.id !== leafId),
          },
        };
      }),
    })),
});
