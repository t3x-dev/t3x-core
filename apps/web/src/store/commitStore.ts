/**
 * commitStore — Commit preparation + tracking (passive).
 *
 * v2 §2.5 — state + setters only. I/O orchestration (commitNodes,
 * initCommitState) lives in hooks/useCommitOperations. Cross-store reads
 * for pure derivation (selectPendingNodes) stay here.
 */

import type { TreeNode } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import { create } from 'zustand';
import { useWorkspaceStore } from './workspaceStore';

interface CommitState {
  // Confirmation tracking
  confirmedNodeIds: Record<string, boolean>;
  confirmedSlotKeys: Record<string, Record<string, boolean>>;
  manualEditedNodeIds: Set<string>;

  // Commit tracking
  lastCommitHash: string | null;
  committedNodeIds: Record<string, boolean>;
  committedNodeSnapshot: Record<string, TreeNode>;
  commitBranch: string;
  projectId: string | null;
  conversationTitle: string | null;
  isCommitting: boolean;
  commitError: string | null;

  // Pure setters (no I/O)
  confirmNode: (treeId: string) => void;
  unconfirmNode: (treeId: string) => void;
  confirmSlot: (treeId: string, slotKey: string) => void;
  unconfirmSlot: (treeId: string, slotKey: string) => void;
  selectPendingNodes: () => TreeNode[];
  setCommitBranch: (branch: string) => void;
  setProjectId: (id: string | null) => void;
  setConversationTitle: (title: string | null) => void;
  setLastCommitHash: (hash: string | null) => void;
  setCommittedState: (ids: Record<string, boolean>, snapshot: Record<string, TreeNode>) => void;
  setIsCommitting: (flag: boolean) => void;
  setCommitError: (msg: string | null) => void;
  clearCommitError: () => void;
  resetManualEditedNodeIds: () => void;
}

export const useCommitStore = create<CommitState>((set, get) => ({
  confirmedNodeIds: {},
  confirmedSlotKeys: {},
  manualEditedNodeIds: new Set(),
  lastCommitHash: null,
  committedNodeIds: {},
  committedNodeSnapshot: {},
  commitBranch: 'main',
  projectId: null,
  conversationTitle: null,
  isCommitting: false,
  commitError: null,

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
      // Confirming a slot auto-confirms the parent node
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
    // Cross-store read: tree from workspaceStore (pure derivation, no I/O)
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
      return false; // committed and unchanged
    });
  },

  setCommitBranch: (branch) => set({ commitBranch: branch }),
  setProjectId: (id) => set({ projectId: id }),
  setConversationTitle: (title) => set({ conversationTitle: title }),
  setLastCommitHash: (hash) => set({ lastCommitHash: hash }),
  setCommittedState: (ids, snapshot) =>
    set({ committedNodeIds: ids, committedNodeSnapshot: snapshot }),
  setIsCommitting: (flag) => set({ isCommitting: flag }),
  setCommitError: (msg) => set({ commitError: msg }),
  clearCommitError: () => set({ commitError: null }),
  resetManualEditedNodeIds: () => set({ manualEditedNodeIds: new Set() }),
}));
