/**
 * commitStore — Commit preparation + tracking
 *
 * Split from extractionPanelStore.ts (Task 4).
 * Owns: confirmed nodes/slots, commit state, commit actions.
 * Cross-store reads: useDraftStore (draft, conversationId), useCommandStore (clearPending).
 */

import type { TreeNode } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import { create } from 'zustand';
import { createCommit, listCommits } from '@/lib/api/commits';

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
    // Cross-store read: draft from draftStore
    const { useDraftStore } = require('./draftStore');
    const { draft } = useDraftStore.getState();
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
    // Cross-store reads — workspace result is source of truth if available
    const { useDraftStore } = await import('./draftStore');
    const { useWorkspaceStore } = await import('./workspaceStore');
    const wsResult = useWorkspaceStore.getState().result;
    const { draft: draftFallback, conversationId } = useDraftStore.getState();
    const draft = wsResult ?? draftFallback;
    const { projectId, lastCommitHash, commitBranch, conversationTitle } = get();

    if (!projectId) throw new Error('No project ID');

    set({ isCommitting: true, commitError: null });
    try {
      // Enrich trees with source_ref before commit
      let enrichedTrees = draft.trees;
      if (conversationId && projectId) {
        try {
          const { enrichTreesWithSourceRefs } = await import('@/lib/enrichSourceRefs');
          const { buildSourceMap } = await import('@/lib/sourceMap');
          const { listTurns } = await import('@/lib/api/turns');

          const turnData = await listTurns(projectId, conversationId);
          const turns = turnData.turns;

          if (turns.length > 0) {
            const turnHashByIndex = new Map<number, string>();
            const messages: Array<{ content: string; turnIndex: number }> = [];
            for (let i = 0; i < turns.length; i++) {
              turnHashByIndex.set(i + 1, turns[i].turn_hash);
              messages.push({ content: turns[i].content, turnIndex: i + 1 });
            }

            const sourceMapByTurn = buildSourceMap(draft, messages);
            enrichedTrees = enrichTreesWithSourceRefs(
              draft.trees,
              conversationId,
              turnHashByIndex,
              sourceMapByTurn
            );
          }
        } catch {
          // Silent fallback — commit without source_ref enrichment
        }
      }

      // Sanitize slot values: API only accepts string | number | SlotRef | Array.
      // Nested objects from LLM extraction must be stringified.
      function sanitizeSlots(slots: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(slots)) {
          if (v !== null && typeof v === 'object' && !Array.isArray(v) && !('ref' in v)) {
            out[k] = JSON.stringify(v);
          } else {
            out[k] = v;
          }
        }
        return out;
      }
      function sanitizeTrees(trees: TreeNode[]): TreeNode[] {
        return trees.map(
          (t) =>
            Object.assign({}, t, {
              slots: sanitizeSlots(t.slots),
              children: sanitizeTrees(t.children),
            }) as TreeNode
        );
      }

      const sanitizedTrees = sanitizeTrees(enrichedTrees);

      // Build sources array: active conversation + selected pins
      const sources: Array<{
        type: string;
        id: string;
        title?: string;
        assertion_lessons?: string[];
      }> = [];

      if (conversationId) {
        sources.push({
          type: 'conversation',
          id: conversationId,
          title: conversationTitle ?? undefined,
        });
      }

      // Add pinned sources that were used in extraction
      const { usePinsStore } = await import('@/store/pinsStore');
      const allPins = usePinsStore.getState().pins;
      for (const pin of allPins) {
        if (pin.type === 'conversation' && pin.ref_id !== conversationId) {
          sources.push({ type: 'conversation', id: pin.ref_id });
        } else if (pin.type === 'leaf') {
          const lessons = (pin.selected_assertion_ids ?? []).map((id) => id);
          sources.push({
            type: 'leaf',
            id: pin.ref_id,
            assertion_lessons: lessons.length > 0 ? lessons : undefined,
          });
        }
      }

      const result = await createCommit(
        projectId,
        {
          trees: sanitizedTrees,
          relations: draft.relations,
        },
        {
          parents: lastCommitHash ? [lastCommitHash] : [],
          branch: commitBranch,
          message: message || undefined,
          sources: sources.length > 0 ? sources : undefined,
          provenance: { method: 'llm_extraction' },
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

      set({
        lastCommitHash: result.commit.hash,
        committedNodeIds: newCommittedIds,
        committedNodeSnapshot: newSnapshot,
        isCommitting: false,
        manualEditedNodeIds: new Set(),
      });

      // Clear command pending state after successful commit
      const { useCommandStore } = await import('./commandStore');
      useCommandStore.getState().clearPending();

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
