/**
 * Tree Compatibility Utilities
 *
 * Provides backward-compatible Tree-like interface from TreeNode.
 * Used by UI components that were written for the old Tree type
 * (id, type, slots) and need to work with TreeNode (key, slots, children).
 */

import type { SemanticContent, SlotValue, TreeNode } from '@t3x-dev/core';

/**
 * Runtime-enriched tree node shape. The API decorates nodes with a legacy
 * turn-tag `source` string (e.g. `"T3"`) for historical commits; newer
 * extractions carry provenance in the workspace `sourceIndex` instead.
 */
type EnrichedTreeNode = TreeNode & {
  source?: string;
};

/**
 * Tree-like object compatible with old UI components.
 * Maps TreeNode to the old Tree interface shape.
 * id = dot-path, type = key name.
 */
/** Slot-level source reference with turn hash and character offsets */
export interface SlotSourceRef {
  turn_hash?: string;
  turn?: string;
  start_char?: number;
  end_char?: number;
}

export interface CompatNode {
  id: string;
  type: string;
  key: string;
  slots: Record<string, SlotValue>;
  source?: string;
  children: TreeNode[];
  /** Slot-level source refs (for backward compat) */
  slot_sources?: Record<string, SlotSourceRef>;
  /** Flag for manually edited nodes */
  manual_edited?: boolean;
}

/**
 * Flatten TreeNode[] into Tree-like objects for backward compatibility.
 * Uses dot-path as id and key as type.
 */
export function treesToNodes(trees: TreeNode[], prefix = ''): CompatNode[] {
  const nodes: CompatNode[] = [];
  for (const rawNode of trees) {
    // Cast to EnrichedTreeNode: API-sourced trees may carry a legacy turn-tag `source`
    const node = rawNode as EnrichedTreeNode;
    const path = prefix ? `${prefix}.${node.key}` : node.key;
    nodes.push({
      id: path,
      key: node.key,
      type: node.key,
      slots: node.slots,
      source: node.source,
      children: node.children,
    });
    if (node.children.length > 0) {
      nodes.push(...treesToNodes(node.children, path));
    }
  }
  return nodes;
}

/**
 * Get flat Tree-like objects from SemanticContent.
 */
export function contentToNodes(content: SemanticContent): CompatNode[] {
  return treesToNodes(content.trees);
}

/**
 * Get compat SemanticContent with both .trees and .nodes.
 * .trees is a flat array of Tree compat objects derived from .trees.
 */
export function toCompatContent(content: SemanticContent): SemanticContent & { nodes: CompatNode[] } {
  return {
    ...content,
    nodes: treesToNodes(content.trees),
  };
}

/**
 * Convert Tree-like objects back to TreeNode[].
 * Only converts top-level trees (those without dots in id) to trees.
 * Nested trees are restored via the children property.
 */
export function nodesToTrees(nodes: CompatNode[]): TreeNode[] {
  return nodes
    .filter((f) => !f.id.includes('.'))
    .map((f) => treeToNode(f));
}

function treeToNode(node: CompatNode): EnrichedTreeNode {
  return {
    key: node.type,
    slots: node.slots,
    children: (node.children ?? []) as EnrichedTreeNode[],
    source: node.source,
  };
}

/**
 * Adapts a SemanticContent to have a .trees property that returns
 * CompatNode[] compat objects lazily.
 */
export function withNodes<T extends SemanticContent>(content: T): T & { nodes: CompatNode[] } {
  const cached = treesToNodes(content.trees);
  return Object.assign({}, content, { nodes: cached });
}
