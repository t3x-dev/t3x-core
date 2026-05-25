/**
 * commitStore — Commit preparation + tracking (passive).
 *
 * Per docs/frontend-architecture-v2-zh.md §2.5, async actions
 * (commit, init) live in `hooks/useCommitActions`. This store only
 * holds state + state-only setters.
 *
 * Cross-store reads still happen at the hook boundary, not here.
 */

import type { TreeNode } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import type { ParentCommit } from '@/types/parentCommit';
import { create } from 'zustand';
import { useWorkspaceStore } from './workspaceStore';

function resetCommitTracking(projectId: string | null): Partial<CommitState> {
  return {
    confirmedNodeIds: {},
    confirmedSlotKeys: {},
    manualEditedNodeIds: new Set(),
    lastCommitHash: null,
    beforeCommitHash: null,
    committedNodeIds: {},
    committedNodeSnapshot: {},
    projectId,
    conversationTitle: null,
    isCommitting: false,
    commitError: null,
  };
}

interface CommitState {
  // Confirmation tracking
  confirmedNodeIds: Record<string, boolean>;
  confirmedSlotKeys: Record<string, Record<string, boolean>>;
  manualEditedNodeIds: Set<string>;

  // Commit tracking
  lastCommitHash: string | null;
  beforeCommitHash: string | null;
  committedNodeIds: Record<string, boolean>;
  committedNodeSnapshot: Record<string, TreeNode>;
  commitBranch: string;
  projectId: string | null;
  conversationTitle: string | null;
  isCommitting: boolean;
  commitError: string | null;
  parentCommitCache: Record<string, ParentCommit>;

  // Pure state mutation
  confirmNode: (treeId: string) => void;
  unconfirmNode: (treeId: string) => void;
  confirmSlot: (treeId: string, slotKey: string) => void;
  unconfirmSlot: (treeId: string, slotKey: string) => void;
  selectPendingNodes: () => TreeNode[];

  // Config
  setCommitBranch: (branch: string) => void;
  setProjectId: (id: string | null) => void;
  setConversationTitle: (title: string | null) => void;
  clearCommitError: () => void;

  // Setters used by useCommitActions after the API resolves
  setIsCommitting: (isCommitting: boolean) => void;
  setCommitError: (error: string | null) => void;
  setCommitSuccess: (result: {
    lastCommitHash: string;
    committedNodeIds: Record<string, boolean>;
    committedNodeSnapshot: Record<string, TreeNode>;
  }) => void;
  setBeforeCommitHash: (hash: string | null) => void;
  cacheParentCommit: (commit: ParentCommit) => void;
  setInitialCommit: (
    hash: string,
    committedNodeIds: Record<string, boolean>,
    committedNodeSnapshot: Record<string, TreeNode>
  ) => void;
}

export const useCommitStore = create<CommitState>((set, get) => ({
  confirmedNodeIds: {},
  confirmedSlotKeys: {},
  manualEditedNodeIds: new Set(),
  lastCommitHash: null,
  beforeCommitHash: null,
  committedNodeIds: {},
  committedNodeSnapshot: {},
  commitBranch: 'main',
  projectId: null,
  conversationTitle: null,
  isCommitting: false,
  commitError: null,
  parentCommitCache: {},

  confirmNode: (treeId) =>
    set((s) => ({
      confirmedNodeIds: { ...s.confirmedNodeIds, [treeId]: true },
    })),

  unconfirmNode: (treeId) =>
    set((s) => {
      const { [treeId]: _, ...rest } = s.confirmedNodeIds;
      return { confirmedNodeIds: rest };
    }),

  confirmSlot: (treeId, slotKey) =>
    set((s) => ({
      confirmedNodeIds: { ...s.confirmedNodeIds, [treeId]: true },
      confirmedSlotKeys: {
        ...s.confirmedSlotKeys,
        [treeId]: { ...s.confirmedSlotKeys[treeId], [slotKey]: true },
      },
    })),

  unconfirmSlot: (treeId, slotKey) =>
    set((s) => {
      const nodeSlots = { ...s.confirmedSlotKeys[treeId] };
      delete nodeSlots[slotKey];
      const hasRemainingSlots = Object.keys(nodeSlots).length > 0;
      return {
        confirmedSlotKeys: { ...s.confirmedSlotKeys, [treeId]: nodeSlots },
        confirmedNodeIds: hasRemainingSlots ? s.confirmedNodeIds : s.confirmedNodeIds,
      };
    }),

  selectPendingNodes: () => {
    const { tree } = useWorkspaceStore.getState();
    const { committedNodeIds, committedNodeSnapshot } = get();
    const flatNodes = flattenTrees(tree.trees);
    return tree.trees.filter((_t: TreeNode, i: number) => {
      const node = flatNodes[i];
      if (!node) return true;
      const nodeId = node.id;
      if (!committedNodeIds[nodeId]) return true;
      const snap = committedNodeSnapshot[nodeId];
      if (!snap) return true;
      return false;
    });
  },

  setCommitBranch: (branch) => set({ commitBranch: branch }),
  setProjectId: (id) =>
    set((s) => (s.projectId === id ? { projectId: id } : resetCommitTracking(id))),
  setConversationTitle: (title) => set({ conversationTitle: title }),
  clearCommitError: () => set({ commitError: null }),

  setIsCommitting: (isCommitting) => set({ isCommitting }),
  setCommitError: (error) => set({ commitError: error }),

  setCommitSuccess: ({ lastCommitHash, committedNodeIds, committedNodeSnapshot }) =>
    set({
      lastCommitHash,
      beforeCommitHash: lastCommitHash,
      committedNodeIds,
      committedNodeSnapshot,
      isCommitting: false,
      manualEditedNodeIds: new Set(),
    }),

  setBeforeCommitHash: (hash) => set({ beforeCommitHash: hash }),

  cacheParentCommit: (commit) =>
    set((s) => ({
      parentCommitCache: { ...s.parentCommitCache, [commit.hash]: commit },
    })),

  setInitialCommit: (hash, committedNodeIds, committedNodeSnapshot) =>
    set({ lastCommitHash: hash, committedNodeIds, committedNodeSnapshot }),
}));
