/**
 * Pure tests for the canvas layout math domain module.
 * No store, no hooks, no React.
 */
import { describe, expect, it } from 'vitest';
import { computeMergeNodePosition, snapPosition } from '@/domain/canvasLayout';

describe('snapPosition', () => {
  it('rounds to the 16px grid', () => {
    expect(snapPosition({ x: 17, y: 31 })).toEqual({ x: 16, y: 32 });
  });
});

describe('computeMergeNodePosition', () => {
  it('returns default (400, 400) when neither node is known', () => {
    expect(computeMergeNodePosition(undefined, undefined)).toEqual({ x: 400, y: 400 });
  });

  it('places merge midway in x and below both in y when both are known', () => {
    const result = computeMergeNodePosition(
      { position: { x: 100, y: 100 } },
      { position: { x: 300, y: 200 } }
    );
    expect(result).toEqual({ x: 208, y: 400 });
  });

  it('falls back to source when target is unknown', () => {
    expect(computeMergeNodePosition({ position: { x: 100, y: 100 } }, undefined)).toEqual({
      x: 96,
      y: 304,
    });
  });

  it('falls back to target when source is unknown', () => {
    expect(computeMergeNodePosition(undefined, { position: { x: 50, y: 50 } })).toEqual({
      x: 48,
      y: 256,
    });
  });
});
