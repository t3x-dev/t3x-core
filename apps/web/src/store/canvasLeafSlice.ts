import type { StateCreator } from 'zustand';
import * as api from '@/lib/api';
import type { EmbeddedLeaf, LeafType } from '../types/nodes';
import type { CanvasState, LeafPanelSlice } from './canvasStoreTypes';

export const createLeafSlice: StateCreator<CanvasState, [], [], LeafPanelSlice> = (set, get) => ({
  // Initial state
  leafPanelOpen: false,
  leafPanelCommitId: undefined,

  // Leaf panel methods
  openLeafPanel: (commitId) => set({ leafPanelOpen: true, leafPanelCommitId: commitId }),
  closeLeafPanel: () => set({ leafPanelOpen: false, leafPanelCommitId: undefined }),

  addLeafNode: async (leafType) => {
    const state = get();
    const notify = state.notifyCallback;

    const commitId = state.leafPanelCommitId;
    if (!commitId) {
      notify?.('No commit selected', 'error');
      return null;
    }

    const unitNode = state.nodes.find((node) => node.id === commitId && node.data.kind === 'unit');
    if (!unitNode) {
      notify?.('Unit not found', 'error');
      return null;
    }

    // Get commit hash from unit node - required for creating leaf
    const commitHash = unitNode.data.commitHash;
    if (!commitHash) {
      notify?.('Commit not saved yet. Please commit first before adding output.', 'error');
      return null;
    }

    const projectId = state.projectId;
    if (!projectId) {
      notify?.('Project not found', 'error');
      return null;
    }

    const leafLabels: Record<LeafType, string> = {
      deploy_agent: 'Deploy',
      tweet: 'Twitter',
      weibo: '微博',
      wechat: '朋友圈',
      email: 'Email',
      article: '文章',
      slack: 'Slack',
      eval: 'Eval',
    };

    // Close panel immediately
    set({ leafPanelOpen: false, leafPanelCommitId: undefined });

    try {
      // Call API to create leaf
      const leaf = await api.createLeaf({
        commit_hash: commitHash,
        type: leafType,
        title: leafLabels[leafType],
        project_id: projectId,
        constraints: [],
        config: {},
      });

      // Embed leaf into parent commit node's data.leaves[]
      set((state) => {
        const newEmbeddedLeaf: EmbeddedLeaf = {
          id: leaf.id,
          type: leafType,
          title: leafLabels[leafType],
          status: 'idle',
          createdAt: leaf.created_at,
        };

        const updatedNodes = state.nodes.map((node) => {
          if (node.id !== commitId) return node;
          const existingLeaves = node.data.leaves || [];
          return {
            ...node,
            data: {
              ...node.data,
              leaves: [...existingLeaves, newEmbeddedLeaf],
            },
          };
        });

        return { nodes: updatedNodes };
      });

      notify?.(`${leafLabels[leafType]} created successfully`, 'success');
      return leaf.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create leaf';
      notify?.(message, 'error');
      return null;
    }
  },

  removeLeafFromNode: async (commitNodeId: string, leafId: string) => {
    const notify = get().notifyCallback;
    try {
      await api.deleteLeaf(leafId);
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
      }));
      notify?.('Leaf deleted', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete leaf';
      notify?.(message, 'error');
    }
  },
});
