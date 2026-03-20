/**
 * Diff Compatibility Check (Step 5)
 *
 * Dry-runs applyDelta + validateIntegrity to verify a delta can be
 * cleanly applied to a snapshot without structural damage.
 *
 * Not a pipeline agent — called from the API route layer where the
 * original delta is available (pipeline agents only see the post-apply content).
 *
 * Pure CODE, no LLM.
 *
 * @see https://github.com/t3x-dev/t3x-core/issues/619
 */

import { applyDelta } from '../semantic/delta';
import type { Delta, SemanticContent } from '../semantic/types';
import { validateIntegrity } from '../semantic/validate';

export interface DiffCheckResult {
  compatible: boolean;
  errors: string[];
}

/**
 * Check whether a delta can be cleanly applied to a snapshot.
 *
 * @param snapshot - Current snapshot (before delta)
 * @param delta - Delta to check
 * @returns compatible: true if apply + validate both succeed
 */
export function checkDiffCompatibility(
  snapshot: SemanticContent,
  delta: Delta
): DiffCheckResult {
  const errors: string[] = [];

  // 1. Try applying the delta
  let result: SemanticContent;
  try {
    result = applyDelta(snapshot, delta);
  } catch (err) {
    return {
      compatible: false,
      errors: [`applyDelta failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  // 2. Validate the result
  const validation = validateIntegrity(result);
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
