/**
 * Dedup Gate (G3)
 *
 * Detects duplicate define operations that would create conflicting nodes.
 * Extracted from: dedupChecker agent logic.
 *
 * Pre-apply gate: operates on raw YOp[] before they're applied.
 */

import type { YOp } from '../../yops/types';
import type { GateResult, GateViolation } from './types';

/** Extract the node key from a define op */
function getDefineKey(op: YOp): { parent: string; key: string } | null {
  if (!('define' in op)) return null;
  return { parent: op.define.parent, key: op.define.key };
}

export function validateDedup(yops: YOp[]): GateResult {
  const violations: GateViolation[] = [];
  const seen = new Map<string, number>(); // "parent:key" → first op index

  for (let i = 0; i < yops.length; i++) {
    const defineKey = getDefineKey(yops[i]);
    if (!defineKey) continue;

    const compositeKey = `${defineKey.parent}:${defineKey.key}`;
    const firstIndex = seen.get(compositeKey);

    if (firstIndex !== undefined) {
      violations.push({
        gate: 'dedup',
        severity: 'error',
        opIndex: i,
        message: `YOp[${i}]: duplicate define "${defineKey.key}" under parent "${defineKey.parent}" (first at YOp[${firstIndex}])`,
      });
    } else {
      seen.set(compositeKey, i);
    }
  }

  return { gate: 'dedup', passed: violations.length === 0, violations };
}
