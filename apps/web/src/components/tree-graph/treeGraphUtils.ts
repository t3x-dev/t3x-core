import type { RELATION_TYPES, SemanticContent, SlotValue, TreeNode } from '@t3x-dev/core';

/**
 * Runtime-enriched tree node shape. API trees from historical commits may
 * carry a legacy turn-tag `source` string (e.g. `"T3"`).
 */
type EnrichedTreeNode = TreeNode & { source?: string };

import type { Edge, Node } from '@xyflow/react';

// ── Exported Types ──

export type ZoomLevel = 'overview' | 'expand' | 'full';

/** Relation type for graph display (from core semantic RELATION_TYPES) */
type RelationType = (typeof RELATION_TYPES)[number];

export interface TreeNodeData {
  treeType: string;
  slots: Record<string, SlotValue>;
  source?: string;
  [key: string]: unknown;
}

export interface RelationEdgeData {
  relationType: RelationType;
  /** When true, the edge plays a stroke-dashoffset draw animation */
  isNew?: boolean;
  [key: string]: unknown;
}

// ── Relation Styles ──

export const RELATION_STYLES: Record<
  string,
  { color: string; label: string; strokeDasharray?: string }
> = {
  causes: { color: 'var(--accent-pending)', label: 'causes' },
  conditions: { color: 'var(--status-warning)', strokeDasharray: '8 4', label: 'conditions' },
  contrasts: { color: 'var(--status-error)', label: 'contrasts' },
  follows: { color: 'var(--text-tertiary)', label: 'follows' },
  depends: { color: 'var(--source)', strokeDasharray: '4 4', label: 'depends' },
};

// ── Helper: flatten trees into node entries with IDs ──

function treesToNodeEntries(trees: TreeNode[], prefix = ''): Array<{ id: string; node: TreeNode }> {
  const entries: Array<{ id: string; node: TreeNode }> = [];
  for (const tree of trees) {
    const id = prefix ? `${prefix}.${tree.key}` : tree.key;
    entries.push({ id, node: tree });
    if (tree.children.length > 0) {
      entries.push(...treesToNodeEntries(tree.children, id));
    }
  }
  return entries;
}

// ── semanticToFlowElements ──

export function semanticToFlowElements(content: SemanticContent): {
  nodes: Node<TreeNodeData>[];
  edges: Edge<RelationEdgeData>[];
} {
  const entries = treesToNodeEntries(content.trees);

  const nodes: Node<TreeNodeData>[] = entries.map(({ id, node }) => ({
    id,
    type: 'treeNode',
    position: { x: 0, y: 0 },
    data: {
      treeType: node.key,
      slots: node.slots,
      source: (node as EnrichedTreeNode).source,
    },
  }));

  const nodeIds = new Set(entries.map((e) => e.id));
  const edges: Edge<RelationEdgeData>[] = content.relations
    .filter((rel) => nodeIds.has(rel.from) && nodeIds.has(rel.to))
    .map((rel) => ({
      id: `${rel.from}-${rel.to}-${rel.type}`,
      source: rel.from,
      target: rel.to,
      type: 'relationEdge',
      data: { relationType: rel.type },
    }));

  return { nodes, edges };
}

// ── filterByZoomLevel ──

/**
 * Determines which nodes are "trunk" (visible in overview).
 * In tree-primary, all top-level trees are trunk; children are hidden in overview.
 */
function getTrunkNodeIds(content: SemanticContent): Set<string> {
  return new Set(content.trees.map((t) => t.key));
}

function filterContent(content: SemanticContent, visibleIds: Set<string>): SemanticContent {
  function filterNodes(trees: TreeNode[]): TreeNode[] {
    return trees
      .filter((t) => visibleIds.has(t.key))
      .map((t) => ({
        ...t,
        children: filterNodes(t.children),
      }));
  }
  return {
    trees: filterNodes(content.trees),
    relations: content.relations.filter((r) => visibleIds.has(r.from) && visibleIds.has(r.to)),
  };
}

export function filterByZoomLevel(
  content: SemanticContent,
  level: ZoomLevel,
  expandedNodeId?: string
): SemanticContent {
  if (level === 'full') {
    return content;
  }

  const trunkIds = getTrunkNodeIds(content);

  if (level === 'overview' || (level === 'expand' && !expandedNodeId)) {
    return filterContent(content, trunkIds);
  }

  // level === 'expand' with expandedNodeId
  // Show trunk + children of the expanded node
  const visible = new Set(trunkIds);
  const expandedTree = content.trees.find((t) => t.key === expandedNodeId);
  if (expandedTree) {
    for (const child of expandedTree.children) {
      visible.add(child.key);
    }
  }
  return filterContent(content, visible);
}
