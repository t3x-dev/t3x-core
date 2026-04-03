import { describe, expect, it } from 'vitest';
import { validateSources } from '../../ops/gates/source';
import type { YOp } from '../../yops/types';

const turns = [
  { role: 'user', content: 'I want to plan a trip to Tokyo with a budget of $3000' },
  { role: 'assistant', content: 'Great choice! The JR Pass costs about $280.' },
];

describe('validateSources', () => {
  it('passes when all sources match turns', () => {
    const yops: YOp[] = [
      { add: { parent: '', node: { trip: { destination: 'Tokyo' } }, source: { destination: 'trip to Tokyo' }, from: 'T1' } },
      { set: { path: 'trip/budget', value: 3000, source: 'budget of $3000', from: 'T1' } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports error for invalid turn reference', () => {
    const yops: YOp[] = [
      { set: { path: 'trip/cost', value: 100, source: 'costs 100', from: 'T99' } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].severity).toBe('error');
    expect(result.violations[0].opIndex).toBe(0);
    expect(result.violations[0].message).toContain('T99');
  });

  it('reports warning for unmatched source quote', () => {
    const yops: YOp[] = [
      { set: { path: 'trip/food', value: 'sushi', source: 'completely fabricated quote nowhere in conversation', from: 'T1' } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(true); // warnings don't fail the gate
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].severity).toBe('warning');
  });

  it('skips ops without source field (unset, drop, fold)', () => {
    const yops: YOp[] = [
      { unset: { path: 'trip/old' } },
      { drop: { path: 'trip/removed' } },
      { fold: { path: 'trip/wrapper' } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('handles add op with record source', () => {
    const yops: YOp[] = [
      { add: { parent: '', node: { trip: { cost: 280 } }, source: { cost: 'JR Pass costs about $280' }, from: 'T2' } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(true);
  });
});
