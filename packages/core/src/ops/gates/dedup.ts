/**
 * Dedup Gate (G3)
 *
 * Detects duplicate add operations that would create conflicting nodes.
 * Extracted from: dedupChecker agent logic.
 *
 * Pre-apply gate: operates on raw YOp[] before they're applied.
 */

import type { GateResult, GateViolation } from './types';
import type { YOp } from '../../yops/types';

/** Extract the node key from an add op */
function getAddKey(op: YOp): { parent: string; key: string } | null {
	if (!('add' in op)) return null;
	const nodeKeys = Object.keys(op.add.node);
	if (nodeKeys.length !== 1) return null;
	return { parent: op.add.parent, key: nodeKeys[0] };
}

export function validateDedup(yops: YOp[]): GateResult {
	const violations: GateViolation[] = [];
	const seen = new Map<string, number>(); // "parent:key" → first op index

	for (let i = 0; i < yops.length; i++) {
		const addKey = getAddKey(yops[i]);
		if (!addKey) continue;

		const compositeKey = `${addKey.parent}:${addKey.key}`;
		const firstIndex = seen.get(compositeKey);

		if (firstIndex !== undefined) {
			violations.push({
				gate: 'dedup',
				severity: 'error',
				opIndex: i,
				message: `YOp[${i}]: duplicate add "${addKey.key}" under parent "${addKey.parent}" (first at YOp[${firstIndex}])`,
			});
		} else {
			seen.set(compositeKey, i);
		}
	}

	return { gate: 'dedup', passed: violations.length === 0, violations };
}
