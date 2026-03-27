import type { TreeDiff, SemanticContent, SlotDiff } from '@t3x-dev/core';
import type { TreeNode as CoreTreeNode } from '@t3x-dev/core';
import { treesToFrames, type Frame } from '@/lib/treeCompat';

// ── Aligned frame list for split view ──

export interface AlignedFrame {
  frameId: string;
  type: 'modified' | 'added' | 'removed' | 'identical';
  leftFrame?: CoreTreeNode;
  rightFrame?: CoreTreeNode;
  slotDiffs?: SlotDiff[];
}

/**
 * Look up a TreeNode from SemanticContent.trees by path (dot-separated key path).
 * Returns undefined if not found.
 */
function findNodeByPath(trees: CoreTreeNode[], path: string): CoreTreeNode | undefined {
  const frames = treesToFrames(trees);
  const f = frames.find((fr) => fr.id === path);
  if (!f) return undefined;
  // Return a TreeNode shape
  return {
    key: f.key,
    slots: f.slots,
    children: f.children,
    source: f.source,
    confidence: f.confidence,
    slot_quotes: f.slot_quotes,
  };
}

/**
 * Build aligned frame list from TreeDiff.
 * Order: modified → removed → added → identical.
 *
 * sourceContent/targetContent are needed to look up full TreeNode objects
 * from paths in the diff result.
 */
export function buildAlignedFrames(
  diff: TreeDiff,
  sourceContent?: SemanticContent,
  targetContent?: SemanticContent
): AlignedFrame[] {
  const aligned: AlignedFrame[] = [];

  for (const mod of diff.modified) {
    aligned.push({
      frameId: mod.path,
      type: 'modified',
      leftFrame: sourceContent ? findNodeByPath(sourceContent.trees, mod.path) : undefined,
      rightFrame: targetContent ? findNodeByPath(targetContent.trees, mod.path) : undefined,
      slotDiffs: mod.slotDiffs,
    });
  }

  for (const path of diff.onlyInSource) {
    aligned.push({
      frameId: path,
      type: 'removed',
      leftFrame: sourceContent ? findNodeByPath(sourceContent.trees, path) : undefined,
    });
  }

  for (const path of diff.onlyInTarget) {
    aligned.push({
      frameId: path,
      type: 'added',
      rightFrame: targetContent ? findNodeByPath(targetContent.trees, path) : undefined,
    });
  }

  for (const path of diff.identical) {
    const node = sourceContent
      ? findNodeByPath(sourceContent.trees, path)
      : targetContent
        ? findNodeByPath(targetContent.trees, path)
        : undefined;
    aligned.push({
      frameId: path,
      type: 'identical',
      leftFrame: node,
      rightFrame: node,
    });
  }

  return aligned;
}

// ── Tree root derivation ──

/** Derive logical root: most incoming edges > first tree */
export function deriveRootFrameId(content: SemanticContent): string | undefined {
  const frames = treesToFrames(content.trees);
  if (frames.length === 0) return undefined;

  const inDegree = new Map<string, number>();
  for (const f of frames) inDegree.set(f.id, 0);
  for (const r of content.relations) {
    inDegree.set(r.to, (inDegree.get(r.to) ?? 0) + 1);
  }

  let maxId = frames[0].id;
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

/** Sidebar display node (NOT the same as core TreeNode) */
export interface DiffTreeNode {
  frameId: string;
  frameType: string;
  diffStatus: 'modified' | 'added' | 'removed' | 'identical';
  relationToParent?: string;
  children: DiffTreeNode[];
}

/**
 * Build tree from frames + relations for sidebar display.
 * Uses relations to determine parent-child hierarchy.
 */
export function buildFrameTree(
  content: SemanticContent,
  diffStatusMap: Map<string, 'modified' | 'added' | 'removed' | 'identical'>,
  rootId?: string
): DiffTreeNode[] {
  const frames = treesToFrames(content.trees);
  const frameMap = new Map(frames.map((f) => [f.id, f]));
  // Relations point FROM child TO parent (e.g., budget -[conditions]-> travel_plan)
  // So r.to is the parent, r.from is the child
  const childEdges = new Map<string, Array<{ childId: string; relType: string }>>();

  for (const r of content.relations) {
    if (!childEdges.has(r.to)) childEdges.set(r.to, []);
    childEdges.get(r.to)!.push({ childId: r.from, relType: r.type });
  }

  const visited = new Set<string>();

  function buildNode(id: string, relToParent?: string): DiffTreeNode | null {
    if (visited.has(id) || !frameMap.has(id)) return null;
    visited.add(id);
    const frame = frameMap.get(id)!;
    const children: DiffTreeNode[] = [];
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
  const trees: DiffTreeNode[] = [];
  if (root) {
    const node = buildNode(root);
    if (node) trees.push(node);
  }
  // Add orphans (not visited by tree traversal)
  for (const f of frames) {
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

export function buildAlignedSlotKeys(leftFrame: CoreTreeNode, rightFrame: CoreTreeNode): AlignedSlot[] {
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
  for (const m of diff.modified) map.set(m.path, 'modified');
  for (const path of diff.onlyInSource) map.set(path, 'removed');
  for (const path of diff.onlyInTarget) map.set(path, 'added');
  for (const path of diff.identical) map.set(path, 'identical');
  return map;
}
