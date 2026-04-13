import { describe, expect, it } from 'vitest';
import type { Source } from '@t3x-dev/core';
import { getSlotSource } from '../source';

const humanAt = (at: string): Source => ({ type: 'human', author: 'e', at });

describe('getSlotSource', () => {
  it('returns null when index is empty', () => {
    expect(getSlotSource(new Map(), 'trip/budget')).toBeNull();
  });

  it('returns exact-match source', () => {
    const idx = new Map<string, Source>([['trip/budget', humanAt('2026-04-12T00:00:00Z')]]);
    expect(getSlotSource(idx, 'trip/budget')?.type).toBe('human');
  });

  it('walks up to ancestor when exact path missing', () => {
    const idx = new Map<string, Source>([['trip', humanAt('2026-04-12T00:00:00Z')]]);
    const result = getSlotSource(idx, 'trip/budget');
    expect(result?.type).toBe('human');
  });

  it('prefers exact match over ancestor', () => {
    const idx = new Map<string, Source>([
      ['trip', { type: 'human', author: 'ancestor', at: '2026-04-12T00:00:00Z' }],
      ['trip/budget', { type: 'human', author: 'exact', at: '2026-04-12T00:00:01Z' }],
    ]);
    const result = getSlotSource(idx, 'trip/budget');
    expect((result as { author: string }).author).toBe('exact');
  });

  it('walks multiple levels up', () => {
    const idx = new Map<string, Source>([['a', humanAt('2026-04-12T00:00:00Z')]]);
    const result = getSlotSource(idx, 'a/b/c/d');
    expect(result?.type).toBe('human');
  });

  it('returns null when no ancestor has source', () => {
    const idx = new Map<string, Source>([['other', humanAt('2026-04-12T00:00:00Z')]]);
    expect(getSlotSource(idx, 'a/b/c')).toBeNull();
  });

  it('handles single-segment paths', () => {
    const idx = new Map<string, Source>([['x', humanAt('2026-04-12T00:00:00Z')]]);
    expect(getSlotSource(idx, 'x')?.type).toBe('human');
    expect(getSlotSource(idx, 'y')).toBeNull();
  });
});
