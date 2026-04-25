/**
 * L3 — pure deterministic replay of a yops log.
 *
 * Input: sourced ops + turns (turns are context for future validation needs).
 * Output: { tree, sourceIndex, partial? } — replay never throws on op-level
 * errors. When the engine fails partway, we return whatever applied + a
 * structured `partial` describing what blew up. Callers (initial load) can
 * render the partial tree and surface a banner; callers that want
 * fail-fast semantics (optimistic appends) can check `partial` and throw
 * themselves (see queries/loadConversation.ts:replayAppended).
 *
 * sourceIndex maps each touched path to the Source that produced (or last
 * overwrote) that slot/node. Only successfully-applied ops appear here.
 */

import type { SemanticContent, Source, SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { applySourcedYOps } from '@t3x-dev/core';

export interface ReplayPartial {
  /** Index of the failing op in the flat ops array. */
  opIndex: number;
  /** How many ops applied successfully before the failure (== opIndex). */
  appliedCount: number;
  /** Engine error code, e.g. PATH_NOT_FOUND. */
  code: string;
  /** Human-readable engine message. */
  message: string;
}

export interface ReplayResult {
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
  partial?: ReplayPartial;
}

const EMPTY: SemanticContent = { trees: [], relations: [] };

/**
 * Extract the path(s) this op writes to, for source indexing.
 * Returns an array because rename touches both old and new paths
 * (though we typically only index the new one for lookup).
 */
function indexPathsFor(op: SourcedYOp): string[] {
  const o = op as Record<string, unknown>;
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
  // Engine returns `applied` whether or not it succeeded. Index sources only
  // for ops that actually landed in the tree.
  const appliedCount = result.applied;
  for (let i = 0; i < appliedCount; i++) {
    const op = ops[i];
    const src = (op as unknown as { source: Source }).source;
    for (const p of indexPathsFor(op)) {
      sourceIndex.set(p, src);
    }
  }

  const tree: SemanticContent = { trees: result.trees, relations: result.relations };

  if (!result.ok) {
    const opIndex = result.error?.op_index ?? appliedCount;
    return {
      tree,
      sourceIndex,
      partial: {
        opIndex,
        appliedCount,
        code: result.error?.code ?? 'UNKNOWN',
        message: result.error?.message ?? `replay failed at op ${opIndex}`,
      },
    };
  }

  return { tree, sourceIndex };
}
