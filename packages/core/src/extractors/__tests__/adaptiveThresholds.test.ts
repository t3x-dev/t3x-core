import { describe, expect, it } from 'vitest';
import type { AdaptiveFeedbackStats } from '../adaptiveThresholds';
import { computeAdaptiveConfig, computeAdaptiveThresholds } from '../adaptiveThresholds';

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

// ═══════════════════════════════════════════════════════════════════════════
// computeAdaptiveConfig (accept-rate based)
// ═══════════════════════════════════════════════════════════════════════════

describe('computeAdaptiveConfig', () => {
  function makeStats(overrides: Partial<AdaptiveFeedbackStats> = {}): AdaptiveFeedbackStats {
    return {
      byInferenceType: {},
      overall: { total: 0, acceptRate: 0, editRate: 0, rejectRate: 0 },
      ...overrides,
    };
  }

  it('returns default multipliers when no feedback data', () => {
    const config = computeAdaptiveConfig(makeStats());
    expect(config.confidenceMultipliers).toEqual({});
    expect(config.suppressedTypes).toEqual([]);
    expect(config.cosineThresholdDelta).toBe(0);
  });

  it('suppresses inference type with <50% accept rate (>= 20 samples)', () => {
    const stats = makeStats({
      byInferenceType: {
        implicit: { total: 30, accepted: 10, edited: 5, rejected: 15 },
      },
      overall: { total: 30, acceptRate: 0.33, editRate: 0.17, rejectRate: 0.5 },
    });

    const config = computeAdaptiveConfig(stats);
    expect(config.suppressedTypes).toContain('implicit');
    expect(config.confidenceMultipliers.implicit).toBe(0);
  });

  it('reduces confidence multiplier for 50-70% accept rate', () => {
    const stats = makeStats({
      byInferenceType: {
        cross_turn: { total: 25, accepted: 15, edited: 5, rejected: 5 },
      },
      overall: { total: 25, acceptRate: 0.6, editRate: 0.2, rejectRate: 0.2 },
    });

    const config = computeAdaptiveConfig(stats);
    // 60% accept → reduce but don't suppress
    expect(config.suppressedTypes).not.toContain('cross_turn');
    expect(config.confidenceMultipliers.cross_turn).toBe(0.7);
  });

  it('keeps default multiplier for >= 70% accept rate', () => {
    const stats = makeStats({
      byInferenceType: {
        direct: { total: 50, accepted: 40, edited: 5, rejected: 5 },
      },
      overall: { total: 50, acceptRate: 0.8, editRate: 0.1, rejectRate: 0.1 },
    });

    const config = computeAdaptiveConfig(stats);
    expect(config.suppressedTypes).not.toContain('direct');
    expect(config.confidenceMultipliers.direct).toBe(1.0);
  });

  it('ignores inference types with fewer than 20 samples', () => {
    const stats = makeStats({
      byInferenceType: {
        implicit: { total: 10, accepted: 2, edited: 1, rejected: 7 },
      },
      overall: { total: 10, acceptRate: 0.2, editRate: 0.1, rejectRate: 0.7 },
    });

    const config = computeAdaptiveConfig(stats);
    // Not enough data → default multiplier
    expect(config.suppressedTypes).not.toContain('implicit');
    expect(config.confidenceMultipliers.implicit).toBe(1.0);
  });

  it('suggests cosine threshold adjustment when edit rate > 30%', () => {
    const stats = makeStats({
      byInferenceType: {
        direct: { total: 50, accepted: 25, edited: 20, rejected: 5 },
      },
      overall: { total: 50, acceptRate: 0.5, editRate: 0.4, rejectRate: 0.1 },
    });

    const config = computeAdaptiveConfig(stats);
    expect(config.cosineThresholdDelta).toBe(-0.02);
  });

  it('does not adjust cosine threshold when edit rate <= 30%', () => {
    const stats = makeStats({
      byInferenceType: {
        direct: { total: 50, accepted: 40, edited: 5, rejected: 5 },
      },
      overall: { total: 50, acceptRate: 0.8, editRate: 0.1, rejectRate: 0.1 },
    });

    const config = computeAdaptiveConfig(stats);
    expect(config.cosineThresholdDelta).toBe(0);
  });

  it('handles multiple inference types independently', () => {
    const stats = makeStats({
      byInferenceType: {
        direct: { total: 40, accepted: 35, edited: 3, rejected: 2 }, // 87.5% → keep
        paraphrase: { total: 30, accepted: 18, edited: 6, rejected: 6 }, // 60% → reduce
        implicit: { total: 25, accepted: 8, edited: 7, rejected: 10 }, // 32% → suppress
      },
      overall: { total: 95, acceptRate: 0.64, editRate: 0.17, rejectRate: 0.19 },
    });

    const config = computeAdaptiveConfig(stats);

    expect(config.confidenceMultipliers.direct).toBe(1.0);
    expect(config.confidenceMultipliers.paraphrase).toBe(0.7);
    expect(config.confidenceMultipliers.implicit).toBe(0);

    expect(config.suppressedTypes).toEqual(['implicit']);
  });

  it('does not adjust cosine threshold when overall total < 20', () => {
    const stats = makeStats({
      byInferenceType: {
        direct: { total: 10, accepted: 3, edited: 5, rejected: 2 },
      },
      overall: { total: 10, acceptRate: 0.3, editRate: 0.5, rejectRate: 0.2 },
    });

    const config = computeAdaptiveConfig(stats);
    // Not enough samples for overall assessment
    expect(config.cosineThresholdDelta).toBe(0);
  });
});
