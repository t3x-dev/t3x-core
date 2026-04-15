import type { TreeNode } from '@t3x-dev/core';

export interface SlotModification {
  key: string;
  oldValue: string;
  newValue: string;
}

export interface TreeDiffResult {
  added: string[];
  removed: string[];
  addedSlots: Record<string, string[]>;
  removedSlots: Record<string, string[]>;
  modifiedSlots: Record<string, SlotModification[]>;
  summary: {
    nodesAdded: number;
    nodesRemoved: number;
    slotsAdded: number;
    slotsRemoved: number;
    slotsModified: number;
  };
}

function flattenNodes(trees: TreeNode[], prefix = ''): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>();
  for (const node of trees) {
    const path = prefix ? `${prefix}/${node.key}` : node.key;
    map.set(path, node);
    if (node.children?.length) {
      for (const [k, v] of flattenNodes(node.children, path)) {
        map.set(k, v);
      }
    }
  }
  return map;
}

export function computeTreeDiff(baseTrees: TreeNode[], resultTrees: TreeNode[]): TreeDiffResult {
  const baseMap = flattenNodes(baseTrees);
  const resultMap = flattenNodes(resultTrees);

  const added: string[] = [];
  const removed: string[] = [];
  const addedSlots: Record<string, string[]> = {};
  const removedSlots: Record<string, string[]> = {};
  const modifiedSlots: Record<string, SlotModification[]> = {};

  for (const [path, node] of resultMap) {
    const baseNode = baseMap.get(path);
    if (!baseNode) {
      added.push(path);
      const slotKeys = Object.keys(node.slots || {});
      if (slotKeys.length) addedSlots[path] = slotKeys;
      continue;
    }
    const baseSlots = baseNode.slots || {};
    const resultSlots = node.slots || {};
    const aSlots: string[] = [];
    const mSlots: SlotModification[] = [];
    const rSlots: string[] = [];

    for (const key of Object.keys(resultSlots)) {
      if (!(key in baseSlots)) {
        aSlots.push(key);
      } else if (String(baseSlots[key]) !== String(resultSlots[key])) {
        mSlots.push({ key, oldValue: String(baseSlots[key]), newValue: String(resultSlots[key]) });
      }
    }
    for (const key of Object.keys(baseSlots)) {
      if (!(key in resultSlots)) rSlots.push(key);
    }
    if (aSlots.length) addedSlots[path] = aSlots;
    if (mSlots.length) modifiedSlots[path] = mSlots;
    if (rSlots.length) removedSlots[path] = rSlots;
  }

  for (const path of baseMap.keys()) {
    if (!resultMap.has(path)) removed.push(path);
  }

  const totalAddedSlots = Object.values(addedSlots).reduce((s, a) => s + a.length, 0);
  const totalRemovedSlots = Object.values(removedSlots).reduce((s, a) => s + a.length, 0);
  const totalModifiedSlots = Object.values(modifiedSlots).reduce((s, a) => s + a.length, 0);

  return {
    added,
    removed,
    addedSlots,
    removedSlots,
    modifiedSlots,
    summary: {
      nodesAdded: added.length,
      nodesRemoved: removed.length,
      slotsAdded: totalAddedSlots,
      slotsRemoved: totalRemovedSlots,
      slotsModified: totalModifiedSlots,
    },
  };
}
