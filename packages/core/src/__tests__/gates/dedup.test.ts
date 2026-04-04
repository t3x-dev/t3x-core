import { describe, expect, it } from 'vitest';
import { validateDedup } from '../../ops/gates/dedup';
import type { YOp } from '../../yops/types';

describe('validateDedup', () => {
	it('passes when no duplicate define ops', () => {
		const yops: YOp[] = [
			{ define: { parent: '', key: 'trip' } },
			{ define: { parent: 'trip', key: 'hotel' } },
		];
		const result = validateDedup(yops);
		expect(result.passed).toBe(true);
	});

	it('detects duplicate define ops with same key and parent', () => {
		const yops: YOp[] = [
			{ define: { parent: '', key: 'trip' } },
			{ define: { parent: '', key: 'trip' } },
		];
		const result = validateDedup(yops);
		expect(result.passed).toBe(false);
		expect(result.violations).toHaveLength(1);
		expect(result.violations[0].severity).toBe('error');
		expect(result.violations[0].opIndex).toBe(1);
	});

	it('allows same key under different parents', () => {
		const yops: YOp[] = [
			{ define: { parent: 'trip_a', key: 'hotel' } },
			{ define: { parent: 'trip_b', key: 'hotel' } },
		];
		const result = validateDedup(yops);
		expect(result.passed).toBe(true);
	});

	it('ignores non-define ops', () => {
		const yops: YOp[] = [
			{ set: { path: 'trip/budget', value: 3000, source: 'budget', from: 'T1' } },
			{ set: { path: 'trip/budget', value: 4000, source: 'budget', from: 'T2' } },
		];
		const result = validateDedup(yops);
		expect(result.passed).toBe(true);
	});
});
