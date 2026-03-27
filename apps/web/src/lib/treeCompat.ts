/**
 * Tree Compatibility Utilities
 *
 * Provides backward-compatible Tree-like interface from TreeNode.
 * Used by UI components that were written for the old Tree type
 * (id, type, slots) and need to work with TreeNode (key, slots, children).
 */

import type { SemanticContent, SlotValue, TreeNode } from '@t3x-dev/core';

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
  confidence?: number;
  children: TreeNode[];
  /** Original slot_quotes from TreeNode */
  slot_quotes?: Record<string, string>;
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
  for (const node of trees) {
    const path = prefix ? `${prefix}.${node.key}` : node.key;
    nodes.push({
      id: path,
      key: node.key,
      type: node.key,
      slots: node.slots,
      source: node.source,
      confidence: node.confidence,
      children: node.children,
      slot_quotes: node.slot_quotes,
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

function treeToNode(node: CompatNode): TreeNode {
  return {
    key: node.type,
    slots: node.slots,
    children: (node.children ?? []),
    source: node.source,
    confidence: node.confidence,
    slot_quotes: node.slot_quotes,
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
