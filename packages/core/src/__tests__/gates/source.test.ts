import { describe, expect, it } from 'vitest';
import { validateSources } from '../../ops/gates/source';
import type { YOp } from '../../t3x-yops/types';

const turns = [
  { role: 'user', content: 'I want to plan a trip to Tokyo with a budget of $3000' },
  { role: 'assistant', content: 'Great choice! The JR Pass costs about $280.' },
];

describe('validateSources', () => {
  it('passes for all ops (source gate is no-op after yops migration)', () => {
    const yops: YOp[] = [
      { define: { path: 'trip' } },
      { populate: { path: 'trip', values: { destination: 'Tokyo' } } },
      { set: { path: 'trip/budget', value: 3000 } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes even for ops that previously had invalid turn references', () => {
    const yops: YOp[] = [
      { set: { path: 'trip/cost', value: 100 } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes for all op types without source metadata', () => {
    const yops: YOp[] = [
      { set: { path: 'trip/food', value: 'sushi' } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
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

  it('passes for populate ops', () => {
    const yops: YOp[] = [
      { populate: { path: 'trip', values: { cost: 280 } } },
    ];
    const result = validateSources(yops, turns);
    expect(result.passed).toBe(true);
  });
});
