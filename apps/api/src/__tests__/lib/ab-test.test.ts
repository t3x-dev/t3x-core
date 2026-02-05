/**
 * A/B Test Statistical Functions Tests
 */

import { describe, expect, it } from 'vitest';
import { twoProportionZTest, twoSampleTTest } from '../../lib/ab-test';

describe('twoProportionZTest', () => {
  it('detects significant difference in pass rates', () => {
    // 50% vs 80% with n=100 each — clearly significant
    const result = twoProportionZTest(50, 100, 80, 100);
    expect(result.isSignificant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.controlMean).toBeCloseTo(0.5);
    expect(result.treatmentMean).toBeCloseTo(0.8);
    expect(result.delta).toBeCloseTo(0.3);
  });

  it('returns not significant for similar rates', () => {
    // 50% vs 52% with n=50 each
    const result = twoProportionZTest(25, 50, 26, 50);
    expect(result.isSignificant).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it('reports adequate sample size when >= 30', () => {
    const result = twoProportionZTest(15, 30, 20, 30);
    expect(result.sampleSizeAdequate).toBe(true);
  });

  it('reports inadequate sample size when < 30', () => {
    const result = twoProportionZTest(5, 10, 8, 10);
    expect(result.sampleSizeAdequate).toBe(false);
  });

  it('computes confidence interval', () => {
    const result = twoProportionZTest(50, 100, 80, 100);
    expect(result.confidenceInterval).toHaveLength(2);
    expect(result.confidenceInterval[0]).toBeLessThan(result.confidenceInterval[1]);
    // The delta (0.3) should be within the CI
    expect(result.confidenceInterval[0]).toBeLessThan(result.delta);
    expect(result.confidenceInterval[1]).toBeGreaterThan(result.delta);
  });

  it('handles identical rates', () => {
    const result = twoProportionZTest(50, 100, 50, 100);
    expect(result.delta).toBeCloseTo(0);
    expect(result.isSignificant).toBe(false);
  });

  it('handles zero success in control', () => {
    const result = twoProportionZTest(0, 50, 25, 50);
    expect(result.controlMean).toBe(0);
    expect(result.treatmentMean).toBe(0.5);
    expect(result.deltaPercent).toBe(100);
  });

  it('handles perfect rates', () => {
    const result = twoProportionZTest(100, 100, 100, 100);
    expect(result.delta).toBeCloseTo(0);
  });

  it('pValue stays in 0-1 range', () => {
    const result = twoProportionZTest(1, 100, 99, 100);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});

describe('twoSampleTTest', () => {
  it('detects significant difference in means', () => {
    const a = Array.from({ length: 50 }, () => 0.5 + Math.random() * 0.1);
    const b = Array.from({ length: 50 }, () => 0.9 + Math.random() * 0.1);
    const result = twoSampleTTest(a, b);
    expect(result.isSignificant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('returns not significant for overlapping distributions', () => {
    const a = [0.5, 0.5, 0.5, 0.5, 0.5];
    const b = [0.51, 0.49, 0.5, 0.52, 0.48];
    const result = twoSampleTTest(a, b);
    expect(result.isSignificant).toBe(false);
  });

  it('handles empty arrays gracefully', () => {
    const result = twoSampleTTest([], []);
    expect(result.pValue).toBe(1);
    expect(result.isSignificant).toBe(false);
    expect(result.sampleSizeAdequate).toBe(false);
  });

  it('handles single element arrays', () => {
    const result = twoSampleTTest([0.5], [0.9]);
    expect(result.pValue).toBe(1);
    expect(result.isSignificant).toBe(false);
    expect(result.controlMean).toBe(0.5);
    expect(result.treatmentMean).toBe(0.9);
  });

  it('reports adequate sample size when >= 30', () => {
    const a = Array.from({ length: 30 }, () => 0.5);
    const b = Array.from({ length: 30 }, () => 0.6);
    const result = twoSampleTTest(a, b);
    expect(result.sampleSizeAdequate).toBe(true);
  });

  it('reports inadequate sample size when < 30', () => {
    const a = [0.5, 0.6, 0.7];
    const b = [0.8, 0.9, 1.0];
    const result = twoSampleTTest(a, b);
    expect(result.sampleSizeAdequate).toBe(false);
  });

  it('computes delta and deltaPercent', () => {
    const a = [0.4, 0.4, 0.4, 0.4, 0.4];
    const b = [0.8, 0.8, 0.8, 0.8, 0.8];
    const result = twoSampleTTest(a, b);
    expect(result.delta).toBeCloseTo(0.4);
    expect(result.deltaPercent).toBeCloseTo(100);
  });

  it('computes confidence interval', () => {
    const a = Array.from({ length: 50 }, () => 0.5);
    const b = Array.from({ length: 50 }, () => 0.8);
    const result = twoSampleTTest(a, b);
    expect(result.confidenceInterval).toHaveLength(2);
    expect(result.confidenceInterval[0]).toBeLessThan(result.confidenceInterval[1]);
  });
});
