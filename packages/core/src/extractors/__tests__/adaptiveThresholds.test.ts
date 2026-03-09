import { describe, expect, it } from 'vitest';
import { computeAdaptiveThresholds } from '../adaptiveThresholds';

describe('computeAdaptiveThresholds', () => {
  it('raises threshold when undo rate > 15%', () => {
    const stats = {
      total: 100,
      by_action: { accept: 80, undo: 20 },
      by_inference_type: {
        direct: { accept: 80, undo: 20 },
      },
    };

    const result = computeAdaptiveThresholds(stats);
    // direct default is 0.85, undo_rate = 20% > 15% → raise by 0.05
    expect(result.direct).toBeCloseTo(0.9);
  });

  it('lowers threshold when undo rate < 5%', () => {
    const stats = {
      total: 100,
      by_action: { accept: 98, undo: 2 },
      by_inference_type: {
        direct: { accept: 98, undo: 2 },
      },
    };

    const result = computeAdaptiveThresholds(stats);
    // undo_rate = 2% < 5% → lower by 0.02
    expect(result.direct).toBeCloseTo(0.83);
  });

  it('keeps threshold unchanged for undo rate between 5-15%', () => {
    const stats = {
      total: 100,
      by_action: { accept: 90, undo: 10 },
      by_inference_type: {
        direct: { accept: 90, undo: 10 },
      },
    };

    const result = computeAdaptiveThresholds(stats);
    expect(result.direct).toBeCloseTo(0.85);
  });

  it('adjusts each inference type independently', () => {
    const stats = {
      total: 200,
      by_action: { accept: 160, undo: 40 },
      by_inference_type: {
        direct: { accept: 95, undo: 5 }, // 5% undo → keep
        paraphrase: { accept: 40, undo: 20 }, // 33% undo → raise
        cross_turn: { accept: 25, undo: 15 }, // 37.5% undo → raise
      },
    };

    const result = computeAdaptiveThresholds(stats);
    expect(result.direct).toBeCloseTo(0.85); // unchanged
    expect(result.paraphrase).toBeCloseTo(0.85); // 0.80 + 0.05
    expect(result.cross_turn).toBeCloseTo(0.8); // 0.75 + 0.05
  });

  it('clamps thresholds to [0.50, 0.99]', () => {
    // Keep lowering would go below 0.50
    const stats = {
      total: 100,
      by_action: { accept: 100 },
      by_inference_type: {
        cross_turn: { accept: 100 },
      },
    };

    const result = computeAdaptiveThresholds(stats, {
      defaults: { direct: 0.85, paraphrase: 0.8, cross_turn: 0.51 },
    });
    // cross_turn: 0.51 - 0.02 = 0.49, clamped to 0.50
    expect(result.cross_turn).toBeGreaterThanOrEqual(0.5);
  });

  it('returns defaults when no feedback data', () => {
    const stats = {
      total: 0,
      by_action: {},
      by_inference_type: {},
    };

    const result = computeAdaptiveThresholds(stats);
    expect(result.direct).toBeCloseTo(0.85);
    expect(result.paraphrase).toBeCloseTo(0.8);
    expect(result.cross_turn).toBeCloseTo(0.75);
  });

  it('ignores inference types with fewer than 10 samples', () => {
    const stats = {
      total: 8,
      by_action: { accept: 4, undo: 4 },
      by_inference_type: {
        direct: { accept: 4, undo: 4 }, // 50% undo but only 8 samples
      },
    };

    const result = computeAdaptiveThresholds(stats);
    // Not enough data → keep default
    expect(result.direct).toBeCloseTo(0.85);
  });
});
