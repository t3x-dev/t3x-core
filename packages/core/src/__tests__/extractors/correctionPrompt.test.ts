import { describe, expect, it } from 'vitest';
import { buildCorrectionPrompt } from '../../extractors/correctionPrompt';
import type { GateViolation } from '../../ops/gates/types';
import type { YOp } from '../../t3x-yops/types';

describe('buildCorrectionPrompt', () => {
  const turns = [
    { role: 'user', content: 'I want to plan a trip to Tokyo next March. Budget around $5000.' },
    { role: 'assistant', content: 'Great choice! March is perfect for cherry blossom season.' },
    { role: 'user', content: "Let's increase the budget to $7000 and cancel the ryokan." },
  ];

  it('builds a correction prompt with rejected YOps and violations', () => {
    const rejected = [
      {
        index: 2,
        yop: { unset: { path: 'trip/ryokan' } } as unknown as YOp,
        violations: [
          {
            gate: 'source' as const,
            severity: 'error' as const,
            opIndex: 2,
            message: 'YOp[2]: turn reference "T5" does not match any turn (valid: T1-T3)',
          },
        ] satisfies GateViolation[],
      },
    ];

    const result = buildCorrectionPrompt({ rejectedYOps: rejected, turns });

    expect(result.systemPrompt).toContain('correction engine');
    expect(result.userPrompt).toContain('Operation #2');
    expect(result.userPrompt).toContain('turn reference');
    expect(result.userPrompt).toContain('FAILED');
  });

  it('includes only referenced turns + last 2 for context', () => {
    const rejected = [
      {
        index: 0,
        yop: { set: { path: 'trip/budget', value: 7000, source: 'not found text', from: 'T1' } } as unknown as YOp,
        violations: [
          {
            gate: 'source' as const,
            severity: 'error' as const,
            opIndex: 0,
            message: 'source quote not found',
          },
        ] satisfies GateViolation[],
      },
    ];

    const result = buildCorrectionPrompt({ rejectedYOps: rejected, turns });

    // Should include T1 (referenced) + T2 and T3 (last 2 for context)
    expect(result.userPrompt).toContain('[T1]');
    expect(result.userPrompt).toContain('[T3]');
  });

  it('system prompt instructs minimal fixes', () => {
    const rejected = [
      {
        index: 0,
        yop: { unset: { path: 'x' } } as unknown as YOp,
        violations: [{ gate: 'source' as const, severity: 'error' as const, opIndex: 0, message: 'test' }],
      },
    ];

    const result = buildCorrectionPrompt({ rejectedYOps: rejected, turns });

    expect(result.systemPrompt).toContain('Fix ONLY the listed operations');
    expect(result.systemPrompt).toContain('unset and drop operations need ONLY their required fields');
  });
});
