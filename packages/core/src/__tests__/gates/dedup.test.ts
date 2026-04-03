import { describe, expect, it } from 'vitest';
import { validateDedup } from '../../ops/gates/dedup';
import type { YOp } from '../../yops/types';

describe('validateDedup', () => {
	it('passes when no duplicate add ops', () => {
		const yops: YOp[] = [
			{ add: { parent: '', node: { trip: { dest: 'Tokyo' } }, source: { dest: 'Tokyo' }, from: 'T1' } },
			{ add: { parent: 'trip', node: { hotel: { name: 'Hilton' } }, source: { name: 'Hilton' }, from: 'T1' } },
		];
		const result = validateDedup(yops);
		expect(result.passed).toBe(true);
	});

	it('detects duplicate add ops with same key and parent', () => {
		const yops: YOp[] = [
			{ add: { parent: '', node: { trip: { dest: 'Tokyo' } }, source: { dest: 'Tokyo' }, from: 'T1' } },
			{ add: { parent: '', node: { trip: { budget: 3000 } }, source: { budget: '3000' }, from: 'T2' } },
		];
		const result = validateDedup(yops);
		expect(result.passed).toBe(false);
		expect(result.violations).toHaveLength(1);
		expect(result.violations[0].severity).toBe('error');
		expect(result.violations[0].opIndex).toBe(1);
	});

	it('allows same key under different parents', () => {
		const yops: YOp[] = [
			{ add: { parent: 'trip_a', node: { hotel: { name: 'Hilton' } }, source: { name: 'Hilton' }, from: 'T1' } },
			{ add: { parent: 'trip_b', node: { hotel: { name: 'Marriott' } }, source: { name: 'Marriott' }, from: 'T1' } },
		];
		const result = validateDedup(yops);
		expect(result.passed).toBe(true);
	});

	it('ignores non-add ops', () => {
		const yops: YOp[] = [
			{ set: { path: 'trip/budget', value: 3000, source: 'budget', from: 'T1' } },
			{ set: { path: 'trip/budget', value: 4000, source: 'budget', from: 'T2' } },
		];
		const result = validateDedup(yops);
		expect(result.passed).toBe(true);
	});
});
