/**
 * Diff Compatibility Check (Step 5)
 *
 * Dry-runs applyYOps + validateIntegrity to verify YOps can be
 * cleanly applied to a snapshot without structural damage.
 *
 * Not a pipeline agent — called from the API route layer where the
 * original YOps are available (pipeline agents only see the post-apply content).
 *
 * Pure CODE, no LLM.
 *
 * @see https://github.com/t3x-dev/t3x-core/issues/619
 */

import type { SemanticContent } from '../semantic/types';
import { validateIntegrity } from '../semantic/validate';
import { applyYOps } from '../yops/engine';
import type { YOp } from '../yops/types';

export interface DiffCheckResult {
  compatible: boolean;
  errors: string[];
}

/**
 * Check whether YOps can be cleanly applied to a snapshot.
 *
 * @param snapshot - Current snapshot (before YOps)
 * @param yops - YOps to check
 * @returns compatible: true if apply + validate both succeed
 */
export function checkDiffCompatibility(snapshot: SemanticContent, yops: YOp[]): DiffCheckResult {
  // 1. Try applying the YOps
  const result = applyYOps(snapshot, yops);
  if (!result.ok) {
    return {
      compatible: false,
      errors: [`applyYOps failed: ${result.error?.message ?? 'unknown'}`],
    };
  }

  // 2. Validate the result
  const newSnapshot: SemanticContent = { trees: result.trees, relations: result.relations };
  const validation = validateIntegrity(newSnapshot);
  const errors: string[] = [];
  if (!validation.valid) {
    for (const e of validation.errors) {
      errors.push(`${e.type}: ${e.message}`);
    }
  }

  return {
    compatible: errors.length === 0,
    errors,
  };
}
