import { applySourcedYOps, type SemanticContent, type SourcedYOp } from '@t3x-dev/core';
import type { RetryFailingOp } from './types';

export function validateExecutableStructure(
  baseTree: SemanticContent,
  ops: readonly SourcedYOp[]
): { ok: true; failingOps: [] } | { ok: false; failingOps: RetryFailingOp[] } {
  const result = applySourcedYOps(baseTree, ops as SourcedYOp[]);
  if (result.ok) return { ok: true, failingOps: [] };

  const firstDetail = result.error
    ? `${result.error.code}: ${result.error.message}`
    : 'UNKNOWN: failed to apply extracted ops';

  return {
    ok: false,
    // For structure failures we return the full batch, not just the first bad op.
    // Later ops may depend on earlier valid defines from the same extraction.
    failingOps: ops.map((op, index) => ({
      op,
      opIndex: index,
      reason: 'invalid_structure',
      detail:
        index === (result.error?.op_index ?? result.applied)
          ? firstDetail
          : `dependent_on_invalid_structure: retry full batch to preserve op ordering`,
    })),
  };
}
