// apps/web/src/store/commitDetailStore.ts

import type { Commit, TreeNode } from '@t3x-dev/core';
import { flattenTrees } from '@t3x-dev/core';
import { create } from 'zustand';

export type FrameDiffStatus = 'identical' | 'added' | 'modified' | 'removed';

export interface EnrichedFrame {
  frame: TreeNode;
  /** path in tree for identification */
  path: string;
  diffStatus: FrameDiffStatus;
  /** For modified nodes: the previous version from parent commit */
  previousFrame?: TreeNode;
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
  commit: Commit | null;
  parentCommit: Commit | null;
  enrichedFrames: EnrichedFrame[];
  removedFrames: EnrichedFrame[];

  // UI
  activeFrameId: string | null;
  sourceViewer: SourceViewerState;
  hoveredSlotKey: string | null;

  // Actions
  setCommit: (commit: Commit, parent: Commit | null) => void;
  setActiveFrame: (id: string | null) => void;
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

function enrichFrames(
  commit: Commit,
  parent: Commit | null
): { enriched: EnrichedFrame[]; removed: EnrichedFrame[] } {
  const parentNodeMap = parent ? buildNodeMap(parent.content.trees) : new Map<string, TreeNode>();
  const currentNodeMap = buildNodeMap(commit.content.trees);

  const enriched: EnrichedFrame[] = [];
  for (const [path, node] of currentNodeMap) {
    const prev = parentNodeMap.get(path);
    if (!parent || !prev) {
      enriched.push({ frame: node, path, diffStatus: 'added' });
    } else {
      const slotsChanged = JSON.stringify(node.slots) !== JSON.stringify(prev.slots);
      enriched.push({
        frame: node,
        path,
        diffStatus: slotsChanged ? 'modified' : 'identical',
        previousFrame: slotsChanged ? prev : undefined,
      });
    }
  }

  const removed: EnrichedFrame[] = [];
  for (const [path, node] of parentNodeMap) {
    if (!currentNodeMap.has(path)) {
      removed.push({ frame: node, path, diffStatus: 'removed' });
    }
  }

  return { enriched, removed };
}

export const useCommitDetailStore = create<CommitDetailState>((set) => ({
  commit: null,
  parentCommit: null,
  enrichedFrames: [],
  removedFrames: [],
  activeFrameId: null,
  sourceViewer: { isOpen: false, activeSlotKey: null, activeTab: 'current' },
  hoveredSlotKey: null,

  setCommit: (commit, parent) => {
    const { enriched, removed } = enrichFrames(commit, parent);
    set({
      commit,
      parentCommit: parent,
      enrichedFrames: enriched,
      removedFrames: removed,
      activeFrameId: null,
      sourceViewer: { isOpen: false, activeSlotKey: null, activeTab: 'current' },
    });
  },

  setActiveFrame: (id) => set({ activeFrameId: id }),

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
