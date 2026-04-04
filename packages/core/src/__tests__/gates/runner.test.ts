import { describe, expect, it } from 'vitest';
import { runGates } from '../../ops/gates/runner';
import type { YOp } from '../../yops/types';
import type { SemanticContent } from '../../semantic/types';

const turns = [
  { role: 'user', content: 'I want to go to Tokyo' },
  { role: 'assistant', content: 'Budget $3000 for the trip.' },
];

describe('runGates', () => {
  it('returns clean report for valid yops and snapshot', () => {
    const yops: YOp[] = [
      { define: { parent: '', key: 'trip' } },
      { populate: { path: 'trip', slots: { dest: 'Tokyo' }, source: { dest: 'go to Tokyo' }, from: 'T1' } },
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

  it('collects rejected op indices from all gates', () => {
    const yops: YOp[] = [
      { set: { path: 'trip/x', value: 1, source: 'x', from: 'T99' } }, // bad turn ref → rejected
      { define: { parent: '', key: 'trip' } },
      { define: { parent: '', key: 'trip' } }, // dup → rejected
    ];
    const snapshot: SemanticContent = { trees: [], relations: [] };

    const report = runGates(yops, snapshot, turns);
    expect(report.rejectedOpIndices).toContain(0); // bad turn ref
    expect(report.rejectedOpIndices).toContain(2); // dup define
    expect(report.rejectedOpIndices).not.toContain(1); // valid
  });

  it('aggregates allViolations from all gates', () => {
    const yops: YOp[] = [
      { set: { path: 'trip/x', value: 1, source: 'x', from: 'T99' } },
    ];
    const snapshot: SemanticContent = { trees: [], relations: [] };

    const report = runGates(yops, snapshot, turns);
    expect(report.allViolations.length).toBeGreaterThan(0);
    expect(report.allViolations[0].gate).toBe('source');
  });
});
