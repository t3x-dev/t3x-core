/**
 * Post-Extraction Transforms
 *
 * Deterministic post-processing steps that run after YOps are applied.
 * These are pure functions (not agents) — they take SemanticContent in,
 * return SemanticContent out (or warnings).
 *
 * Order:
 *   1. consolidate     — merge duplicate node types into arrays
 *   2. nest            — build tree hierarchy from relations
 *   3. flagContradictions — mark slots that conflict with user avoidances
 *   4. checkRegression — warn if content was lost (advisory only)
 */

export { consolidate } from './consolidate';
export { nest } from './nest';
export { flagContradictions } from './flagContradictions';
export { checkRegression, type RegressionWarning } from './checkRegression';

import type { SemanticContent } from '../../semantic/types';
import { checkRegression, type RegressionWarning } from './checkRegression';
import { consolidate } from './consolidate';
import { flagContradictions } from './flagContradictions';
import { nest } from './nest';

export interface TransformResult {
  content: SemanticContent;
  regressionWarnings: RegressionWarning[];
}

/**
 * Run all post-extraction transforms in order.
 * Replaces MeaningPipeline + createMeaningPipeline.
 */
export function runTransforms(
  content: SemanticContent,
  turns: Array<{ role: string; content: string }>,
  previousSnapshot?: SemanticContent,
): TransformResult {
  let result = content;

  // 1. Merge duplicate node types
  result = consolidate(result);

  // 2. Build nesting from relations
  result = nest(result);

  // 3. Flag contradictions (non-destructive)
  result = flagContradictions(result, turns);

  // 4. Check for regression (advisory)
  const regressionWarnings = checkRegression(result, previousSnapshot);

  return { content: result, regressionWarnings };
}
