/**
 * Dedup Gate (G3)
 *
 * Detects duplicate define operations that would create conflicting nodes.
 * Extracted from: dedupChecker agent logic.
 *
 * Pre-apply gate: operates on raw YOp[] before they're applied.
 */

import type { YOp } from '../../t3x-yops/types';
import type { GateResult, GateViolation } from './types';

/** Extract the parent and key from a define op's path */
function getDefineKey(op: YOp): { parent: string; key: string } | null {
  if (!('define' in op)) return null;
  const path = op.define.path;
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return { parent: '', key: path };
  return { parent: path.slice(0, lastSlash), key: path.slice(lastSlash + 1) };
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
