/**
 * Enrich tree nodes with source_ref in their slots before committing.
 * Maps buildSourceMap() results back into tree node slots.
 */
import type { TreeNode } from '@t3x-dev/core';
import type { SourceMapping } from './sourceMap';

interface EnrichContext {
  conversationId: string;
  /** Map from turnIndex (1-based) to turn_hash */
  turnHashByIndex: Map<number, string>;
  /** All source mappings keyed by turnIndex */
  sourceMapByTurn: Map<number, SourceMapping[]>;
}

/**
 * Walk a tree and inject source_ref into slots where a matching SourceMapping exists.
 * Mutates the tree in-place for efficiency (caller should pass a deep clone if needed).
 */
function enrichNode(node: TreeNode, parentPath: string, ctx: EnrichContext): void {
  const path = parentPath ? `${parentPath}/${node.key}` : node.key;

  // Find all mappings that point to this tree path
  for (const [turnIndex, mappings] of ctx.sourceMapByTurn) {
    for (const m of mappings) {
      if (m.treePath !== path) continue;

      const turnHash = ctx.turnHashByIndex.get(turnIndex);
      if (!turnHash) continue;

      // Inject source_ref into slots
      if (!node.slots) node.slots = {};
      node.slots.source_ref = {
        conversation_id: ctx.conversationId,
        turn_hash: turnHash,
        start_char: m.start,
        end_char: m.end,
      };
      // Use first match only (one source_ref per node)
      enrichChildren();
      return;
    }
  }

  enrichChildren();

  function enrichChildren() {
    for (const child of node.children ?? []) {
      enrichNode(child, path, ctx);
    }
  }
}

/**
 * Deep clone trees and enrich with source_ref.
 * Returns new tree array (original is not mutated).
 */
export function enrichTreesWithSourceRefs(
  trees: TreeNode[],
  conversationId: string,
  turnHashByIndex: Map<number, string>,
  sourceMapByTurn: Map<number, SourceMapping[]>
): TreeNode[] {
  if (sourceMapByTurn.size === 0) return trees;

  const cloned: TreeNode[] = JSON.parse(JSON.stringify(trees));
  const ctx: EnrichContext = { conversationId, turnHashByIndex, sourceMapByTurn };

  for (const tree of cloned) {
    enrichNode(tree, '', ctx);
  }

  return cloned;
}
