import type { StateCreator } from 'zustand';
import { getTerminology } from '@/hooks/useTerminology';
import { createLeafInProject, deleteLeafById } from '@/queries/leaves';
import { isDeveloperMode } from '@/store/shared';
import type { EmbeddedLeaf, LeafType } from '../types/nodes';
import type { CanvasState, LeafPanelSlice } from './canvasStoreTypes';

export const createLeafSlice: StateCreator<CanvasState, [], [], LeafPanelSlice> = (set, get) => ({
  // Initial state
  leafPanelOpen: false,
  leafPanelCommitId: undefined,
  leafCreating: false,

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
      const dev = isDeveloperMode();
      notify?.(
        `${getTerminology('commit', dev)} not saved yet. Please ${getTerminology('commitAction', dev).toLowerCase()} first before adding output.`,
        'error'
      );
      return null;
    }

    const projectId = state.projectId;
    if (!projectId) {
      notify?.('Project not found', 'error');
      return null;
    }

    const leafLabels: Record<LeafType, string> = {
      tweet: 'Twitter',
      weibo: 'Weibo',
      wechat: 'WeChat Moments',
      email: 'Email',
      article: 'Article',
      slack: 'Slack',
      deploy_agent: 'Deploy Agent',
    };

    set({ leafCreating: true });

    try {
      // Call API to create leaf
      const leaf = await createLeafInProject({
        commit_hash: commitHash,
        type: leafType,
        title: leafLabels[leafType],
        project_id: projectId,
        constraints: [],
        config: {},
      });

      // Close panel only after API call succeeds
      set({ leafPanelOpen: false, leafPanelCommitId: undefined, leafCreating: false });

      // Embed leaf into parent commit node's data.leaves[]
      set((state) => {
        const newEmbeddedLeaf: EmbeddedLeaf = {
          id: leaf.id,
          type: leafType,
          title: leafLabels[leafType],
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
      set({ leafCreating: false });
      // Keep panel open on failure so user can retry
      return null;
    }
  },

  addLeafFromTemplate: async (template) => {
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

    const commitHash = unitNode.data.commitHash;
    if (!commitHash) {
      const dev = isDeveloperMode();
      notify?.(
        `${getTerminology('commit', dev)} not saved yet. Please ${getTerminology('commitAction', dev).toLowerCase()} first before adding output.`,
        'error'
      );
      return null;
    }

    const projectId = state.projectId;
    if (!projectId) {
      notify?.('Project not found', 'error');
      return null;
    }

    set({ leafCreating: true });

    try {
      const leafType = template.leaf_type as LeafType;
      const leaf = await createLeafInProject({
        commit_hash: commitHash,
        type: leafType,
        title: template.title,
        project_id: projectId,
        constraints: [],
        config: {
          template_id: template.template_id,
          prompt_template: template.system_prompt,
        },
      });

      set({ leafPanelOpen: false, leafPanelCommitId: undefined, leafCreating: false });

      // Embed leaf into parent commit node
      set((state) => {
        const newEmbeddedLeaf: EmbeddedLeaf = {
          id: leaf.id,
          type: leafType,
          title: template.title,
          createdAt: leaf.created_at,
        };

        const updatedNodes = state.nodes.map((node) => {
          if (node.id !== commitId) return node;
          const existingLeaves = node.data.leaves || [];
          return {
            ...node,
            data: { ...node.data, leaves: [...existingLeaves, newEmbeddedLeaf] },
          };
        });

        return { nodes: updatedNodes };
      });

      notify?.(`${template.title} leaf created from template`, 'success');
      return leaf.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create leaf from template';
      notify?.(message, 'error');
      set({ leafCreating: false });
      return null;
    }
  },

  removeLeafFromNode: async (commitNodeId: string, leafId: string) => {
    const notify = get().notifyCallback;
    try {
      await deleteLeafById(leafId);
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
