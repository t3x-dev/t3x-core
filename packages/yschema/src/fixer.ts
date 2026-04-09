/**
 * @t3x-dev/schema — Fixer
 *
 * Collects auto-fixable violations and returns the YOps operations
 * needed to resolve them. The caller can apply them via applyYOps.
 */

import type { YOp } from '@t3x-dev/yops';
import type { SchemaResult } from './types';

export interface FixPlan {
  /** YOps operations to apply (in order). */
  ops: YOp[];
  /** Number of violations that will be resolved. */
  fixes_count: number;
  /** Number of violations that cannot be auto-fixed. */
  manual_count: number;
}

/**
 * Generate a fix plan from validation violations.
 * Only includes violations that have a `fix` field.
 */
export function buildFixPlan(result: SchemaResult): FixPlan {
  const ops: YOp[] = [];
  let manual = 0;

  for (const v of result.violations) {
    if (v.fix && v.fix.length > 0) {
      ops.push(...v.fix);
    } else {
      manual++;
    }
  }

  return {
    ops,
    fixes_count: result.violations.length - manual,
    manual_count: manual,
  };
}
