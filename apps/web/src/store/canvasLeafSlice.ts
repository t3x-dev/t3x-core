/**
 * canvasLeafSlice — leaf-panel UI state + node-embed setters (passive).
 *
 * v2 §2.5 — state + setters only. I/O orchestration (create/delete leaf
 * via API, notify callbacks) lives in hooks/useLeafOperations.
 */

import type { StateCreator } from 'zustand';
import type { EmbeddedLeaf } from '../types/nodes';
import type { CanvasState, LeafPanelSlice } from './canvasStoreTypes';

export const createLeafSlice: StateCreator<CanvasState, [], [], LeafPanelSlice> = (set) => ({
  // Initial state
  leafPanelOpen: false,
  leafPanelCommitId: undefined,
  leafCreating: false,

  // Pure setters (no I/O)
  openLeafPanel: (commitId) => set({ leafPanelOpen: true, leafPanelCommitId: commitId }),
  closeLeafPanel: () => set({ leafPanelOpen: false, leafPanelCommitId: undefined }),
  setLeafCreating: (flag: boolean) => set({ leafCreating: flag }),

  embedLeafInCommit: (commitNodeId: string, leaf: EmbeddedLeaf) =>
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

  removeLeafFromCommit: (commitNodeId: string, leafId: string) =>
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
