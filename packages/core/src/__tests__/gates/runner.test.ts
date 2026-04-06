import { describe, expect, it } from 'vitest';
import { runGates } from '../../ops/gates/runner';
import type { YOp } from '../../t3x-yops/types';
import type { SemanticContent } from '../../semantic/types';

const turns = [
  { role: 'user', content: 'I want to go to Tokyo' },
  { role: 'assistant', content: 'Budget $3000 for the trip.' },
];

describe('runGates', () => {
  it('returns clean report for valid yops and snapshot', () => {
    const yops: YOp[] = [
      { define: { path: 'trip' } },
      { populate: { path: 'trip', values: { dest: 'Tokyo' } } },
    ];
    const snapshot: SemanticContent = {
      trees: [{ key: 'trip', slots: { dest: 'Tokyo' }, children: [] }],
      relations: [],
    };

    const report = runGates(yops, snapshot, turns);
    expect(report.source.passed).toBe(true);
    expect(report.dedup.passed).toBe(true);
    expect(report.structure.passed).toBe(true);
    expect(report.rejectedOpIndices).toHaveLength(0);
  });

  it('collects rejected op indices from dedup gate', () => {
    const yops: YOp[] = [
      { set: { path: 'trip/x', value: 1 } },
      { define: { path: 'trip' } },
      { define: { path: 'trip' } }, // dup → rejected
    ];
    const snapshot: SemanticContent = { trees: [], relations: [] };

    const report = runGates(yops, snapshot, turns);
    expect(report.rejectedOpIndices).toContain(2); // dup define
    expect(report.rejectedOpIndices).not.toContain(0); // valid
    expect(report.rejectedOpIndices).not.toContain(1); // valid
  });

  it('aggregates allViolations from all gates', () => {
    const yops: YOp[] = [
      { define: { path: 'trip' } },
      { define: { path: 'trip' } }, // dup
    ];
    const snapshot: SemanticContent = { trees: [], relations: [] };

    const report = runGates(yops, snapshot, turns);
    expect(report.allViolations.length).toBeGreaterThan(0);
    expect(report.allViolations[0].gate).toBe('dedup');
  });
});
