import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';
import type { CanvasNodeData, EmbeddedLeaf } from '../types/nodes';
import type { CanvasState, NodeSlice } from './canvasStoreTypes';

/**
 * Node slice — canvas node/edge state + pure setters.
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions
 * (loadProjectData, refreshLeaves, addNode, addDraftNode) live in
 * `hooks/useCanvasNodeActions`. This slice only holds state and
 * state-only setters.
 *
 * Pure setters the hook calls after the I/O resolves:
 *  - setProjectData         — one-shot "full load" (non-merge mode)
 *  - mergeProjectData       — "polling/incremental" update that
 *                             preserves existing nodes + positions
 *  - setLeavesByCommit      — refreshLeaves result
 *  - addToNodes             — single-node append (addNode / addDraftNode)
 */

interface ProjectDataInput {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  hasMainCommit: boolean;
  latestMainCommitId: string | undefined;
  hasDbPositions: boolean;
}

export const createNodeSlice: StateCreator<CanvasState, [], [], NodeSlice> = (set) => ({
  // ── Passive setters ──────────────────────────────────────────────
  setLoading: (loading) => set({ loading }),
  setLoadError: (loadError) => set({ loadError }),

  setProjectData: ({ nodes, edges, hasMainCommit, latestMainCommitId, hasDbPositions }) =>
    set({
      nodes,
      edges,
      hasMainCommit,
      latestMainCommitId,
      hasDbPositions,
      loading: false,
      loadError: null,
    }),

  /**
   * Merge-mode update: append new nodes/edges by id, preserve existing
   * positions + flags. Called from polling refreshes.
   */
  mergeProjectData: ({ nodes, edges, hasMainCommit, latestMainCommitId, hasDbPositions }) =>
    set((state) => {
      const existingNodeIds = new Set(state.nodes.map((n) => n.id));
      const existingEdgeIds = new Set(state.edges.map((e) => e.id));
      const newNodes = nodes.filter((n) => !existingNodeIds.has(n.id));
      const newEdges = edges.filter((e) => !existingEdgeIds.has(e.id));

      if (newNodes.length === 0 && newEdges.length === 0) {
        // Nothing structural changed — still reconcile root flags
        return {
          hasMainCommit,
          latestMainCommitId,
          hasDbPositions: state.hasDbPositions || hasDbPositions,
        };
      }

      return {
        nodes: [...state.nodes, ...newNodes],
        edges: [...state.edges, ...newEdges],
        hasMainCommit,
        latestMainCommitId,
        hasDbPositions: state.hasDbPositions || hasDbPositions,
      };
    }),

  setLeavesByCommit: (leavesByCommit) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        const commitHash = node.data.commitHash;
        if (!commitHash) return node;
        const newLeaves: EmbeddedLeaf[] = leavesByCommit.get(commitHash) || [];
        const oldLeaves = node.data.leaves || [];
        const oldIds = oldLeaves
          .map((l) => l.id)
          .sort()
          .join(',');
        const newIds = newLeaves
          .map((l) => l.id)
          .sort()
          .join(',');
        if (oldIds === newIds) return node;
        return { ...node, data: { ...node.data, leaves: newLeaves } };
      }),
    })),

  addToNodes: (node) => set((state) => ({ nodes: [...state.nodes, node] })),

  clearCanvas: () => {
    set({
      nodes: [],
      edges: [],
      projectId: null,
      loading: false,
      loadError: null,
      hasMainCommit: false,
      latestMainCommitId: undefined,
      hasDbPositions: false,
    });
  },

  updateNode: (id, patch) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
      ),
    })),

  // Update node ID and all related edges (for syncing local pending commit with API commit_hash)
  updateNodeId: (oldId, newId) =>
    set((state) => {
      const updatedNodes = state.nodes.map((node) =>
        node.id === oldId ? { ...node, id: newId } : node
      );

      const updatedEdges = state.edges.map((edge) => {
        let updated = edge;
        if (edge.source === oldId) updated = { ...updated, source: newId };
        if (edge.target === oldId) updated = { ...updated, target: newId };
        if (edge.id.includes(oldId)) {
          updated = { ...updated, id: edge.id.replace(oldId, newId) };
        }
        return updated;
      });

      const latestMainCommitId =
        state.latestMainCommitId === oldId ? newId : state.latestMainCommitId;
      const openNodeId = state.openNodeId === oldId ? newId : state.openNodeId;

      return {
        nodes: updatedNodes,
        edges: updatedEdges,
        latestMainCommitId,
        openNodeId,
      };
    }),
});

export type { ProjectDataInput };
