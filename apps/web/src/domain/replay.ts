/**
 * L3 — pure deterministic replay of a yops log.
 *
 * Input: sourced ops + turns (turns are context for future validation needs).
 * Output: { tree, sourceIndex }.
 *
 * sourceIndex maps each touched path to the Source that produced (or last
 * overwrote) that slot/node. Later ops supersede earlier ones at the same
 * path. If the engine fails partway through, only successfully-applied ops
 * appear in the sourceIndex.
 */

import type { SemanticContent, Source, SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { applySourcedYOps } from '@t3x-dev/core';

export interface ReplayResult {
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
}

const EMPTY: SemanticContent = { trees: [], relations: [] };

/**
 * Extract the path(s) this op writes to, for source indexing.
 * Returns an array because rename touches both old and new paths
 * (though we typically only index the new one for lookup).
 */
function indexPathsFor(op: SourcedYOp): string[] {
  const o = op as Record<string, unknown>;
  // Iterate candidate keys; each op has exactly one discriminant key besides `source`.
  for (const key of Object.keys(o)) {
    if (key === 'source') continue;
    const v = o[key] as { path?: string; to?: string; from?: string } | undefined;
    if (!v || typeof v !== 'object') continue;
    if (key === 'move' || key === 'clone') {
      return v.to ? [v.to] : [];
    }
    if (key === 'rename') {
      return v.to ? [v.to] : [];
    }
    if (key === 'relate' || key === 'unrelate') {
      return v.from ? [v.from] : [];
    }
    return v.path ? [v.path] : [];
  }
  return [];
}

export function replay(
  ops: readonly SourcedYOp[],
  _turns: readonly ValidationTurn[]
): ReplayResult {
  const result = applySourcedYOps(EMPTY, ops as SourcedYOp[]);
  const sourceIndex = new Map<string, Source>();

  const appliedCount = result.ok ? ops.length : result.applied;
  for (let i = 0; i < appliedCount; i++) {
    const op = ops[i];
    const src = (op as unknown as { source: Source }).source;
    for (const p of indexPathsFor(op)) {
      sourceIndex.set(p, src);
    }
  }

  return {
    tree: { trees: result.trees, relations: result.relations },
    sourceIndex,
  };
}
