/**
 * Pure graph helpers for usePendingCommitState — extracted so the
 * hook file stays under the 400-line mega-hook threshold (PR25).
 *
 * Lives alongside the hook rather than in domain/ because the input
 * types reference @xyflow/react and our canvas node-data shape.
 */

import type { Edge, Node } from '@xyflow/react';
import type { CanvasNodeData } from '@/types/nodes';

/**
 * Walk the canvas graph upstream from a staging node to find the
 * nearest committed unit's commit hash. Used when a node's
 * sourceCommitHash metadata wasn't set (e.g. manual edge drag).
 */
export function findUpstreamCommitHash(
  nodeId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[]
): string | undefined {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const stack = edges.filter((e) => e.target === nodeId).map((e) => e.source);

  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const n = nodeMap.get(id);
    if (!n) continue;
    if (n.data.kind === 'unit' && n.data.commitStatus === 'committed' && n.data.commitHash) {
      return n.data.commitHash;
    }
    for (const e of edges) {
      if (e.target === id && !visited.has(e.source)) {
        stack.push(e.source);
      }
    }
  }
  return undefined;
}
