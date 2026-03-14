import { describe, it, expect } from 'vitest';
import { relevanceScore, type RelevanceContext } from '@/lib/relevanceScore';

const makeFrame = (id: string) => ({ id, type: 'test', slots: { val: 'x' } });

describe('relevanceScore', () => {
  it('returns 1.0 for confirmed frames', () => {
    const ctx: RelevanceContext = {
      confirmedFrameIds: { f_001: true },
      llmHighlightedFrameIds: {},
      turnsAgoMap: { f_001: 5 },
    };
    expect(relevanceScore(makeFrame('f_001'), ctx)).toBe(1.0);
  });

  it('returns 0.8 for LLM-highlighted frames', () => {
    const ctx: RelevanceContext = {
      confirmedFrameIds: {},
      llmHighlightedFrameIds: { f_001: true },
      turnsAgoMap: { f_001: 10 },
    };
    expect(relevanceScore(makeFrame('f_001'), ctx)).toBe(0.8);
  });

  it('returns 1.0 for frame touched this turn (turnsAgo=0)', () => {
    const ctx: RelevanceContext = {
      confirmedFrameIds: {},
      llmHighlightedFrameIds: {},
      turnsAgoMap: { f_001: 0 },
    };
    expect(relevanceScore(makeFrame('f_001'), ctx)).toBe(1.0);
  });

  it('decays recency exponentially (0.7^turnsAgo)', () => {
    const ctx: RelevanceContext = {
      confirmedFrameIds: {},
      llmHighlightedFrameIds: {},
      turnsAgoMap: { f_001: 2 },
    };
    const score = relevanceScore(makeFrame('f_001'), ctx);
    expect(score).toBeCloseTo(0.49, 2); // 0.7^2
  });

  it('returns 0 for unknown frame (not in turnsAgoMap)', () => {
    const ctx: RelevanceContext = {
      confirmedFrameIds: {},
      llmHighlightedFrameIds: {},
      turnsAgoMap: {},
    };
    expect(relevanceScore(makeFrame('f_999'), ctx)).toBe(0);
  });

  it('confirmed takes precedence over LLM boost', () => {
    const ctx: RelevanceContext = {
      confirmedFrameIds: { f_001: true },
      llmHighlightedFrameIds: { f_001: true },
      turnsAgoMap: { f_001: 0 },
    };
    expect(relevanceScore(makeFrame('f_001'), ctx)).toBe(1.0);
  });
});
