/**
 * Gate Runner
 *
 * Orchestrates all gates and produces an aggregated report.
 */

import type { SemanticContent } from '../../semantic/types';
import type { YOp } from '../../yops/types';
import { validateDedup } from './dedup';
import { validateSources } from './source';
import { validateStructure } from './structure';
import type { GateReport } from './types';

export function runGates(
  yops: YOp[],
  snapshot: SemanticContent,
  turns: Array<{ role: string; content: string }>
): GateReport {
  const source = validateSources(yops, turns);
  const dedup = validateDedup(yops);
  const structure = validateStructure(snapshot);

  const allViolations = [...source.violations, ...dedup.violations, ...structure.violations];

  const rejectedOpIndices = [
    ...new Set(
      allViolations.filter((v) => v.severity === 'error' && v.opIndex >= 0).map((v) => v.opIndex)
    ),
  ].sort((a, b) => a - b);

  return { source, dedup, structure, rejectedOpIndices, allViolations };
}
