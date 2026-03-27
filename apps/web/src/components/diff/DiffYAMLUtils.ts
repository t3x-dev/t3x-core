// @ts-nocheck — tree-primary migration: needs rework
import type { TreeNode, TreeDiff, SemanticContent } from '@t3x-dev/core';
import type { Frame } from '@/lib/treeCompat';

// ── Aligned frame list for split view ──

export interface AlignedFrame {
  frameId: string;
  type: 'modified' | 'added' | 'removed' | 'identical';
  leftFrame?: TreeNode;
  rightFrame?: TreeNode;
  slotDiffs?: TreeDiff['modified'][number]['slotDiffs'];
}

/**
 * Build aligned frame list from TreeDiff.
 * Order: modified → removed → added → identical.
 */
export function buildAlignedFrames(diff: TreeDiff): AlignedFrame[] {
  const aligned: AlignedFrame[] = [];

  for (const mod of diff.modified) {
    aligned.push({
      frameId: mod.frameId,
      type: 'modified',
      leftFrame: mod.sourceFrame,
      rightFrame: mod.targetFrame,
      slotDiffs: mod.slotDiffs,
    });
  }

  for (const frame of diff.onlyInSource) {
    aligned.push({ frameId: frame.id, type: 'removed', leftFrame: frame });
  }

  for (const frame of diff.onlyInTarget) {
    aligned.push({ frameId: frame.id, type: 'added', rightFrame: frame });
  }

  for (const frame of diff.identical) {
    aligned.push({
      frameId: frame.id,
      type: 'identical',
      leftFrame: frame,
      rightFrame: frame,
    });
  }

  return aligned;
}

// ── Tree root derivation ──

/** Derive logical root: explicit root_frame_id > most incoming edges > first frame */
export function deriveRootFrameId(content: SemanticContent): string | undefined {
  if (content.root_frame_id) return content.root_frame_id;
  if (content.trees.length === 0) return undefined;

  const inDegree = new Map<string, number>();
  for (const f of content.trees) inDegree.set(f.id, 0);
  for (const r of content.relations) {
    inDegree.set(r.to, (inDegree.get(r.to) ?? 0) + 1);
  }

  let maxId = content.trees[0].id;
  let maxDeg = 0;
  for (const [id, deg] of inDegree) {
    if (deg > maxDeg) {
      maxDeg = deg;
      maxId = id;
    }
  }
  return maxId;
}

// ── Tree structure for sidebar ──

export interface TreeNode {
  frameId: string;
  frameType: string;
  diffStatus: 'modified' | 'added' | 'removed' | 'identical';
  relationToParent?: string;
  children: TreeNode[];
}

/**
 * Build tree from frames + relations for sidebar display.
 * Uses relations to determine parent-child hierarchy.
 */
export function buildFrameTree(
  content: SemanticContent,
  diffStatusMap: Map<string, 'modified' | 'added' | 'removed' | 'identical'>,
  rootId?: string
): TreeNode[] {
  const frameMap = new Map(content.trees.map((f) => [f.id, f]));
  // Relations point FROM child TO parent (e.g., budget -[conditions]-> travel_plan)
  // So r.to is the parent, r.from is the child
  const childEdges = new Map<string, Array<{ childId: string; relType: string }>>();

  for (const r of content.relations) {
    if (!childEdges.has(r.to)) childEdges.set(r.to, []);
    childEdges.get(r.to)!.push({ childId: r.from, relType: r.type });
  }

  const visited = new Set<string>();

  function buildNode(id: string, relToParent?: string): TreeNode | null {
    if (visited.has(id) || !frameMap.has(id)) return null;
    visited.add(id);
    const frame = frameMap.get(id)!;
    const children: TreeNode[] = [];
    for (const edge of childEdges.get(id) ?? []) {
      const child = buildNode(edge.childId, edge.relType);
      if (child) children.push(child);
    }
    return {
      frameId: id,
      frameType: frame.type,
      diffStatus: diffStatusMap.get(id) ?? 'identical',
      relationToParent: relToParent,
      children,
    };
  }

  const root = rootId ?? deriveRootFrameId(content);
  const trees: TreeNode[] = [];
  if (root) {
    const node = buildNode(root);
    if (node) trees.push(node);
  }
  // Add orphans (not visited by tree traversal)
  for (const f of content.trees) {
    if (!visited.has(f.id)) {
      const node = buildNode(f.id);
      if (node) trees.push(node);
    }
  }
  return trees;
}

/**
 * Compute merged slot key order for side-by-side alignment.
 * Returns keys in order: shared keys (preserving target order), then removed-only, then added-only.
 */
export interface AlignedSlot {
  key: string;
  inLeft: boolean;
  inRight: boolean;
}

export function buildAlignedSlotKeys(leftFrame: TreeNode, rightFrame: TreeNode): AlignedSlot[] {
  const leftKeys = Object.keys(leftFrame.slots);
  const rightKeys = Object.keys(rightFrame.slots);
  const rightSet = new Set(rightKeys);
  const leftSet = new Set(leftKeys);

  const result: AlignedSlot[] = [];

  // First: keys in right frame order (target is primary narrative)
  for (const key of rightKeys) {
    result.push({ key, inLeft: leftSet.has(key), inRight: true });
  }

  // Then: keys only in left (removed slots), preserving left order
  for (const key of leftKeys) {
    if (!rightSet.has(key)) {
      result.push({ key, inLeft: true, inRight: false });
    }
  }

  return result;
}

/**
 * Build a diff status map from TreeDiff for use with buildFrameTree.
 */
export function buildDiffStatusMap(
  diff: TreeDiff
): Map<string, 'modified' | 'added' | 'removed' | 'identical'> {
  const map = new Map<string, 'modified' | 'added' | 'removed' | 'identical'>();
  for (const m of diff.modified) map.set(m.frameId, 'modified');
  for (const f of diff.onlyInSource) map.set(f.id, 'removed');
  for (const f of diff.onlyInTarget) map.set(f.id, 'added');
  for (const f of diff.identical) map.set(f.id, 'identical');
  return map;
}
