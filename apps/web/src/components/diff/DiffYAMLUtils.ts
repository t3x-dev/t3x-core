import type { TreeDiff, SemanticContent, SlotDiff } from '@t3x-dev/core';
import type { TreeNode as CoreTreeNode } from '@t3x-dev/core';
import { treesToNodes, type CompatNode } from '@/lib/treeCompat';

// ── Aligned tree list for split view ──

export interface AlignedNode {
  treeId: string;
  type: 'modified' | 'added' | 'removed' | 'identical';
  leftNode?: CoreTreeNode;
  rightNode?: CoreTreeNode;
  slotDiffs?: SlotDiff[];
}

/**
 * Look up a TreeNode from SemanticContent.trees by path (dot-separated key path).
 * Returns undefined if not found.
 */
function findNodeByPath(trees: CoreTreeNode[], path: string): CoreTreeNode | undefined {
  const nodes = treesToNodes(trees);
  const f = nodes.find((fr) => fr.id === path);
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
 * Build aligned tree list from TreeDiff.
 * Order: modified → removed → added → identical.
 *
 * sourceContent/targetContent are needed to look up full TreeNode objects
 * from paths in the diff result.
 */
export function buildAlignedNodes(
  diff: TreeDiff,
  sourceContent?: SemanticContent,
  targetContent?: SemanticContent
): AlignedNode[] {
  const aligned: AlignedNode[] = [];

  for (const mod of diff.modified) {
    aligned.push({
      treeId: mod.path,
      type: 'modified',
      leftNode: sourceContent ? findNodeByPath(sourceContent.trees, mod.path) : undefined,
      rightNode: targetContent ? findNodeByPath(targetContent.trees, mod.path) : undefined,
      slotDiffs: mod.slotDiffs,
    });
  }

  // Collapse child paths: skip paths whose ANY ancestor is already in the same set.
  // e.g., if "a/b" is removed, skip "a/b/c" and "a/b/c/d".
  const sourceSet = new Set(diff.onlyInSource);
  for (const path of diff.onlyInSource) {
    let ancestor = path;
    let skip = false;
    while (ancestor.includes('/')) {
      ancestor = ancestor.slice(0, ancestor.lastIndexOf('/'));
      if (sourceSet.has(ancestor)) { skip = true; break; }
    }
    if (skip) continue;
    aligned.push({
      treeId: path,
      type: 'removed',
      leftNode: sourceContent ? findNodeByPath(sourceContent.trees, path) : undefined,
    });
  }

  const targetSet = new Set(diff.onlyInTarget);
  for (const path of diff.onlyInTarget) {
    let ancestor = path;
    let skip = false;
    while (ancestor.includes('/')) {
      ancestor = ancestor.slice(0, ancestor.lastIndexOf('/'));
      if (targetSet.has(ancestor)) { skip = true; break; }
    }
    if (skip) continue;
    aligned.push({
      treeId: path,
      type: 'added',
      rightNode: targetContent ? findNodeByPath(targetContent.trees, path) : undefined,
    });
  }

  for (const path of diff.identical) {
    const node = sourceContent
      ? findNodeByPath(sourceContent.trees, path)
      : targetContent
        ? findNodeByPath(targetContent.trees, path)
        : undefined;
    aligned.push({
      treeId: path,
      type: 'identical',
      leftNode: node,
      rightNode: node,
    });
  }

  return aligned;
}

// ── Tree root derivation ──

/** Derive logical root: most incoming edges > first tree */
export function deriveRootNodeId(content: SemanticContent): string | undefined {
  const nodes = treesToNodes(content.trees);
  if (nodes.length === 0) return undefined;

  const inDegree = new Map<string, number>();
  for (const f of nodes) inDegree.set(f.id, 0);
  for (const r of content.relations) {
    inDegree.set(r.to, (inDegree.get(r.to) ?? 0) + 1);
  }

  let maxId = nodes[0].id;
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
  treeId: string;
  treeType: string;
  diffStatus: 'modified' | 'added' | 'removed' | 'identical';
  relationToParent?: string;
  children: DiffTreeNode[];
}

/**
 * Build tree from trees + relations for sidebar display.
 * Uses relations to determine parent-child hierarchy.
 */
export function buildTreeGraph(
  content: SemanticContent,
  diffStatusMap: Map<string, 'modified' | 'added' | 'removed' | 'identical'>,
  rootId?: string
): DiffTreeNode[] {
  const nodes = treesToNodes(content.trees);
  const treeMap = new Map(nodes.map((f) => [f.id, f]));
  // Relations point FROM child TO parent (e.g., budget -[conditions]-> travel_plan)
  // So r.to is the parent, r.from is the child
  const childEdges = new Map<string, Array<{ childId: string; relType: string }>>();

  for (const r of content.relations) {
    if (!childEdges.has(r.to)) childEdges.set(r.to, []);
    childEdges.get(r.to)!.push({ childId: r.from, relType: r.type });
  }

  const visited = new Set<string>();

  function buildNode(id: string, relToParent?: string): DiffTreeNode | null {
    if (visited.has(id) || !treeMap.has(id)) return null;
    visited.add(id);
    const node = treeMap.get(id)!;
    const children: DiffTreeNode[] = [];
    for (const edge of childEdges.get(id) ?? []) {
      const child = buildNode(edge.childId, edge.relType);
      if (child) children.push(child);
    }
    return {
      treeId: id,
      treeType: node.type,
      diffStatus: diffStatusMap.get(id) ?? 'identical',
      relationToParent: relToParent,
      children,
    };
  }

  const root = rootId ?? deriveRootNodeId(content);
  const trees: DiffTreeNode[] = [];
  if (root) {
    const node = buildNode(root);
    if (node) trees.push(node);
  }
  // Add orphans (not visited by tree traversal)
  for (const f of nodes) {
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

export function buildAlignedSlotKeys(leftNode: CoreTreeNode, rightNode: CoreTreeNode): AlignedSlot[] {
  const leftKeys = Object.keys(leftNode.slots);
  const rightKeys = Object.keys(rightNode.slots);
  const rightSet = new Set(rightKeys);
  const leftSet = new Set(leftKeys);

  const result: AlignedSlot[] = [];

  // First: keys in right tree order (target is primary narrative)
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
 * Build a diff status map from TreeDiff for use with buildTreeGraph.
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
