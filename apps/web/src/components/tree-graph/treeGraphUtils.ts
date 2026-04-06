import type { SemanticContent, SlotValue, TreeNode } from '@t3x-dev/core';
import { flattenTrees, RELATION_TYPES } from '@t3x-dev/core';
import type { Edge, Node } from '@xyflow/react';
import type { GateCheckResult } from '@/lib/api/trees';

// ── Exported Types ──

export type ZoomLevel = 'overview' | 'expand' | 'full';

/** Relation type for graph display (from core semantic RELATION_TYPES) */
type RelationType = (typeof RELATION_TYPES)[number];

export interface TreeNodeData {
  treeType: string;
  slots: Record<string, SlotValue>;
  source?: string;
  // Gate status fields
  gateStatus?: 'passed' | 'warning' | 'error' | 'unchecked';
  gateIssueCount?: number;
  gateIssueSummary?: string;
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
  causes: { color: '#f97316', label: 'causes' },
  conditions: { color: '#eab308', strokeDasharray: '8 4', label: 'conditions' },
  contrasts: { color: '#ef4444', label: 'contrasts' },
  follows: { color: '#9ca3af', label: 'follows' },
  depends: { color: '#a855f7', strokeDasharray: '4 4', label: 'depends' },
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
      source: node.source,
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

// ── Gate result mapping ──

export function mapGateResultsToNodes(
  nodes: Node<TreeNodeData>[],
  gateResult: GateCheckResult | null
): Node<TreeNodeData>[] {
  if (!gateResult?.semantic?.issues) return nodes;

  const issuesByNode = new Map<
    string,
    { count: number; maxSeverity: 'error' | 'warning' | 'info'; summary: string }
  >();
  for (const issue of gateResult.semantic.issues) {
    if (!issue.tree_id) continue;
    const severity = issue.severity;
    const existing = issuesByNode.get(issue.tree_id);
    if (!existing) {
      issuesByNode.set(issue.tree_id, {
        count: 1,
        maxSeverity: severity,
        summary: `${issue.dimension}: ${issue.description}`,
      });
    } else {
      existing.count++;
      if (severity === 'error') existing.maxSeverity = 'error';
      else if (severity === 'warning' && existing.maxSeverity !== 'error')
        existing.maxSeverity = 'warning';
    }
  }

  return nodes.map((node) => {
    const treeIssues = issuesByNode.get(node.id);
    if (!treeIssues) {
      return { ...node, data: { ...node.data, gateStatus: 'passed' as const } };
    }
    return {
      ...node,
      data: {
        ...node.data,
        gateStatus:
          treeIssues.maxSeverity === 'info'
            ? ('passed' as const)
            : (treeIssues.maxSeverity as 'warning' | 'error'),
        gateIssueCount: treeIssues.count,
        gateIssueSummary: treeIssues.summary,
      },
    };
  });
}
