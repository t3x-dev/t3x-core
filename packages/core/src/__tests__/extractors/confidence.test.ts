import { describe, expect, it } from 'vitest';
import { computeConfidence } from '../../extractors/confidence';

const userTurn = { hash: 'sha256:aaa', role: 'user' as const, content: 'I prefer dark roast coffee every morning.' };
const assistantTurn = { hash: 'sha256:bbb', role: 'assistant' as const, content: 'You mentioned you prefer dark roast coffee.' };

describe('computeConfidence', () => {
  it('returns baseline 0.5 when no signals are present', () => {
    const score = computeConfidence({
      source: 'totally unrelated text that will not match',
      from: 'T99', // no such turn
      turns: [userTurn],
    });
    expect(score).toBe(0.5);
  });

  it('scores higher for exact source quotes from user turns', () => {
    const score = computeConfidence({
      source: 'dark roast coffee every morning',
      from: 'T1',
      turns: [userTurn],
    });
    // baseline 0.5 + fuzzy ~1.0 * 0.3 + user 0.15 = ~0.95
    expect(score).toBeGreaterThanOrEqual(0.9);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('scores lower for assistant turn sources vs user', () => {
    const userScore = computeConfidence({
      source: 'dark roast coffee',
      from: 'T1',
      turns: [userTurn],
    });
    const assistantScore = computeConfidence({
      source: 'dark roast coffee',
      from: 'T1',
      turns: [assistantTurn],
    });
    expect(userScore).toBeGreaterThan(assistantScore);
    expect(userScore - assistantScore).toBeCloseTo(0.15, 1);
  });

  it('clamps score between 0 and 1', () => {
    // Max: exact match + user + confirmed
    const high = computeConfidence({
      source: 'I prefer dark roast coffee every morning.',
      from: 'T1',
      turns: [userTurn],
      isConfirmed: true,
    });
    expect(high).toBeLessThanOrEqual(1.0);
    expect(high).toBeGreaterThan(0.9);

    // Min: no match + contradiction
    const low = computeConfidence({
      source: 'xyz',
      from: 'T99',
      turns: [userTurn],
      hasContradiction: true,
    });
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBe(0.3); // 0.5 - 0.2
  });

  it('applies contradiction penalty', () => {
    const withoutContradiction = computeConfidence({
      source: 'dark roast coffee',
      from: 'T1',
      turns: [userTurn],
    });
    const withContradiction = computeConfidence({
      source: 'dark roast coffee',
      from: 'T1',
      turns: [userTurn],
      hasContradiction: true,
    });
    expect(withoutContradiction - withContradiction).toBeCloseTo(0.2, 1);
  });

  it('adds confirmation bonus', () => {
    const base = computeConfidence({
      source: 'dark roast coffee',
      from: 'T1',
      turns: [assistantTurn], // assistant turn so score stays below 1.0
    });
    const confirmed = computeConfidence({
      source: 'dark roast coffee',
      from: 'T1',
      turns: [assistantTurn],
      isConfirmed: true,
    });
    expect(confirmed - base).toBeCloseTo(0.1, 1);
  });

  it('handles T2 reference correctly', () => {
    const score = computeConfidence({
      source: 'dark roast coffee',
      from: 'T2',
      turns: [assistantTurn, userTurn],
    });
    // T2 -> turns[1] which is userTurn
    expect(score).toBeGreaterThan(0.8);
  });
});
