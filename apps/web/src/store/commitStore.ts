/**
 * commitStore — Commit preparation + tracking
 *
 * Split from extractionPanelStore.ts (Task 4).
 * Owns: confirmed nodes/slots, commit state, commit actions.
 * Cross-store reads: useExtractionStore (draft, conversationId), useExtractionUIStore (panelMode).
 */

import type { TreeNode, YOpsLogEntry } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import { create } from 'zustand';
import { createCommit, listCommits } from '@/lib/api/commits';
import { createYOpsEntry } from '@/lib/api/trees';

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

  // Methods
  confirmNode: (treeId: string) => void;
  unconfirmNode: (treeId: string) => void;
  confirmSlot: (treeId: string, slotKey: string) => void;
  unconfirmSlot: (treeId: string, slotKey: string) => void;
  selectPendingNodes: () => TreeNode[];
  commitNodes: (message: string) => Promise<{ hash: string }>;
  setCommitBranch: (branch: string) => void;
  setProjectId: (id: string | null) => void;
  setConversationTitle: (title: string | null) => void;
  initCommitState: (projectId: string) => Promise<void>;
  clearCommitError: () => void;
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
    // Cross-store read: draft from extractionStore
    const { useExtractionStore } = require('./extractionStore');
    const { draft } = useExtractionStore.getState();
    const { committedNodeIds, committedNodeSnapshot } = get();
    const flatNodes = flattenTrees(draft.trees);
    return draft.trees.filter((_t: TreeNode, i: number) => {
      const node = flatNodes[i];
      if (!node) return true;
      const nodeId = node.id;
      if (!committedNodeIds[nodeId]) return true;
      const snap = committedNodeSnapshot[nodeId];
      if (!snap) return true;
      return false; // committed and unchanged
    });
  },

  commitNodes: async (message) => {
    // Cross-store reads
    const { useExtractionStore } = await import('./extractionStore');
    const { useExtractionUIStore } = await import('./extractionUIStore');

    const extractionState = useExtractionStore.getState();
    const { draft, conversationId } = extractionState;
    const { projectId, lastCommitHash, commitBranch, conversationTitle } = get();

    if (!projectId) throw new Error('No project ID');

    set({ isCommitting: true, commitError: null });
    try {
      const result = await createCommit(
        projectId,
        {
          trees: draft.trees,
          relations: draft.relations,
        },
        {
          parents: lastCommitHash ? [lastCommitHash] : [],
          branch: commitBranch,
          message: message || undefined,
          sources: conversationId
            ? [{ type: 'conversation', id: conversationId, title: conversationTitle ?? undefined }]
            : undefined,
          provenance: { method: 'pipeline' },
        }
      );

      const newCommittedIds: Record<string, boolean> = {};
      const newSnapshot: Record<string, TreeNode> = {};
      const flat = flattenTrees(draft.trees);
      for (const f of flat) {
        newCommittedIds[f.id] = true;
      }
      for (const t of draft.trees) {
        newSnapshot[t.key] = { ...t, slots: { ...t.slots } };
      }

      // Insert commit marker into yops log (links change history to commit)
      if (conversationId) {
        const markerEntry: YOpsLogEntry = {
          id: crypto.randomUUID(),
          source: 'commit_marker',
          yops: { changes: [] },
          created_at: new Date().toISOString(),
          commit_hash: result.commit.hash,
        };
        // Update yopsLog in extractionStore
        useExtractionStore.setState((s) => ({ yopsLog: [...s.yopsLog, markerEntry] }));

        // Persist the marker to DB
        createYOpsEntry(conversationId, { changes: [] }, 'commit_marker').catch(() => {});
      }

      set({
        lastCommitHash: result.commit.hash,
        committedNodeIds: newCommittedIds,
        committedNodeSnapshot: newSnapshot,
        isCommitting: false,
        manualEditedNodeIds: new Set(),
      });

      // Cross-store update: reset panel mode
      useExtractionUIStore.getState().setPanelMode('default');

      return { hash: result.commit.hash };
    } catch (err) {
      set({
        isCommitting: false,
        commitError: err instanceof Error ? err.message : 'Commit failed',
      });
      throw err;
    }
  },

  setCommitBranch: (branch) => set({ commitBranch: branch }),
  setProjectId: (id) => set({ projectId: id }),
  setConversationTitle: (title) => set({ conversationTitle: title }),
  clearCommitError: () => set({ commitError: null }),

  initCommitState: async (projectId) => {
    try {
      // Try to load the latest commit
      const recentCommits = await listCommits(projectId, 'main', 1).catch(() => []);
      if (recentCommits.length > 0) {
        const head = recentCommits[0];
        set({ lastCommitHash: head.hash });
        const trees = (head.content?.trees ?? []) as TreeNode[];
        if (trees.length > 0) {
          const flat = flattenTrees(trees);
          const ids: Record<string, boolean> = {};
          const snapshot: Record<string, TreeNode> = {};
          for (const f of flat) {
            ids[f.id] = true;
          }
          for (const t of trees) {
            snapshot[t.key] = t;
          }
          set({ committedNodeIds: ids, committedNodeSnapshot: snapshot });
        }
      }
    } catch {
      // Silent fallback — treat as no prior commits
    }
  },
}));
