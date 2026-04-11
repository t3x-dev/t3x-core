// apps/web/src/store/commitDetailStore.ts

import type { TreeNode } from '@t3x-dev/core';
import type { ApiCommit } from '@/lib/api';
import { flattenTrees } from '@t3x-dev/core';
import { create } from 'zustand';

export type DiffStatus = 'identical' | 'added' | 'modified' | 'removed';

export interface EnrichedNode {
  node: TreeNode;
  /** path in tree for identification */
  path: string;
  diffStatus: DiffStatus;
  /** For modified nodes: the previous version from parent commit */
  previousNode?: TreeNode;
}

interface SourceViewerState {
  isOpen: boolean;
  /** The slot key being inspected */
  activeSlotKey: string | null;
  /** Tab: 'previous' | 'current' for changed slots */
  activeTab: 'previous' | 'current';
}

interface CommitDetailState {
  // Data
  commit: ApiCommit | null;
  parentCommit: ApiCommit | null;
  enrichedNodes: EnrichedNode[];
  removedNodes: EnrichedNode[];

  // UI
  activeNodeId: string | null;
  sourceViewer: SourceViewerState;
  hoveredSlotKey: string | null;

  // Actions
  setCommit: (commit: ApiCommit, parent: ApiCommit | null) => void;
  setActiveNode: (id: string | null) => void;
  openSourceViewer: (slotKey: string) => void;
  closeSourceViewer: () => void;
  setSourceTab: (tab: 'previous' | 'current') => void;
  setHoveredSlot: (key: string | null) => void;
}

/** Build a flat map of path → TreeNode from trees */
function buildNodeMap(trees: TreeNode[], prefix = ''): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>();
  for (const node of trees) {
    const path = prefix ? `${prefix}.${node.key}` : node.key;
    map.set(path, node);
    if (node.children.length > 0) {
      for (const [childPath, childNode] of buildNodeMap(node.children, path)) {
        map.set(childPath, childNode);
      }
    }
  }
  return map;
}

function enrichNodes(
  commit: ApiCommit,
  parent: ApiCommit | null
): { enriched: EnrichedNode[]; removed: EnrichedNode[] } {
  const parentNodeMap = parent ? buildNodeMap(parent.content.trees) : new Map<string, TreeNode>();
  const currentNodeMap = buildNodeMap(commit.content.trees);

  const enriched: EnrichedNode[] = [];
  for (const [path, node] of currentNodeMap) {
    const prev = parentNodeMap.get(path);
    if (!parent || !prev) {
      enriched.push({ node: node, path, diffStatus: 'added' });
    } else {
      const slotsChanged = JSON.stringify(node.slots) !== JSON.stringify(prev.slots);
      enriched.push({
        node: node,
        path,
        diffStatus: slotsChanged ? 'modified' : 'identical',
        previousNode: slotsChanged ? prev : undefined,
      });
    }
  }

  const removed: EnrichedNode[] = [];
  for (const [path, node] of parentNodeMap) {
    if (!currentNodeMap.has(path)) {
      removed.push({ node: node, path, diffStatus: 'removed' });
    }
  }

  return { enriched, removed };
}

export const useCommitDetailStore = create<CommitDetailState>((set) => ({
  commit: null,
  parentCommit: null,
  enrichedNodes: [],
  removedNodes: [],
  activeNodeId: null,
  sourceViewer: { isOpen: false, activeSlotKey: null, activeTab: 'current' },
  hoveredSlotKey: null,

  setCommit: (commit, parent) => {
    const { enriched, removed } = enrichNodes(commit, parent);
    set({
      commit,
      parentCommit: parent,
      enrichedNodes: enriched,
      removedNodes: removed,
      activeNodeId: null,
      sourceViewer: { isOpen: false, activeSlotKey: null, activeTab: 'current' },
    });
  },

  setActiveNode: (id) => set({ activeNodeId: id }),

  openSourceViewer: (slotKey) =>
    set(() => ({
      sourceViewer: { isOpen: true, activeSlotKey: slotKey, activeTab: 'current' },
    })),

  closeSourceViewer: () =>
    set((s) => ({
      sourceViewer: { ...s.sourceViewer, isOpen: false, activeSlotKey: null },
    })),

  setSourceTab: (tab) =>
    set((s) => ({
      sourceViewer: { ...s.sourceViewer, activeTab: tab },
    })),

  setHoveredSlot: (key) => set({ hoveredSlotKey: key }),
}));
