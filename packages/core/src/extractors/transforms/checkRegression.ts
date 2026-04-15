/**
 * Check Regression — detect significant content loss after extraction.
 *
 * Compares current snapshot against previous one. If >30% of nodes
 * disappeared, returns warnings (likely extraction regression, not
 * intentional removal).
 *
 * Pure deterministic check. No LLM. Does NOT modify content.
 */

import { flattenTrees } from '../../semantic/tree';
import type { FlatNode, SemanticContent } from '../../semantic/types';

const REGRESSION_THRESHOLD = 0.3;

export interface RegressionWarning {
  type: 'count_drop' | 'types_disappeared';
  message: string;
}

export function checkRegression(
  current: SemanticContent,
  previous: SemanticContent | undefined
): RegressionWarning[] {
  if (!previous || previous.trees.length === 0) return [];

  const warnings: RegressionWarning[] = [];

  const prevFrames: FlatNode[] = flattenTrees(previous.trees);
  const currFrames: FlatNode[] = flattenTrees(current.trees);
  const prevCount = prevFrames.length;
  const currCount = currFrames.length;

  if (currCount < prevCount) {
    const lossRatio = (prevCount - currCount) / prevCount;
    if (lossRatio > REGRESSION_THRESHOLD) {
      warnings.push({
        type: 'count_drop',
        message: `Node count dropped ${prevCount}→${currCount} (${Math.round(lossRatio * 100)}% loss)`,
      });
    }
  }

  const prevTypes = new Set(prevFrames.map((f) => f.type));
  const currTypes = new Set(currFrames.map((f) => f.type));
  const disappeared: string[] = [];
  for (const t of prevTypes) {
    if (!currTypes.has(t)) disappeared.push(t as string);
  }

  if (disappeared.length > 0) {
    warnings.push({
      type: 'types_disappeared',
      message: `Node types disappeared: ${disappeared.join(', ')}`,
    });
  }

  return warnings;
}
