import { describe, expect, it } from 'vitest';
import { type RelevanceContext, relevanceScore } from '@/lib/relevanceScore';

const makeFrame = (id: string, confidence?: number) => ({
  id,
  type: 'test',
  slots: { val: 'x' },
  ...(confidence != null ? { confidence } : {}),
});

const emptyCtx: RelevanceContext = {
  confirmedFrameIds: {},
  llmHighlightedFrameIds: {},
  turnsAgoMap: {},
  touchCountMap: {},
  relationDegreeMap: {},
};

describe('relevanceScore', () => {
  it('returns 1.0 for confirmed frames', () => {
    const ctx: RelevanceContext = {
      ...emptyCtx,
      confirmedFrameIds: { f_001: true },
      turnsAgoMap: { f_001: 5 },
    };
    const result = relevanceScore(makeFrame('f_001'), ctx);
    expect(result.score).toBe(1.0);
    expect(result.reasons[0].signal).toBe('confirmed');
  });

  it('returns 0.8 for LLM-highlighted frames', () => {
    const ctx: RelevanceContext = {
      ...emptyCtx,
      llmHighlightedFrameIds: { f_001: true },
      turnsAgoMap: { f_001: 10 },
    };
    const result = relevanceScore(makeFrame('f_001'), ctx);
    expect(result.score).toBe(0.8);
    expect(result.reasons[0].signal).toBe('llm_boost');
  });

  it('returns 1.0 for frame touched this turn (turnsAgo=0)', () => {
    const ctx: RelevanceContext = { ...emptyCtx, turnsAgoMap: { f_001: 0 } };
    const result = relevanceScore(makeFrame('f_001'), ctx);
    expect(result.score).toBe(1.0);
    expect(result.reasons[0].reason).toBe('Changed this turn');
  });

  it('decays recency exponentially (0.7^turnsAgo)', () => {
    const ctx: RelevanceContext = { ...emptyCtx, turnsAgoMap: { f_001: 2 } };
    const result = relevanceScore(makeFrame('f_001'), ctx);
    expect(result.score).toBeCloseTo(0.49, 2); // 0.7^2
  });

  it('returns 0 for unknown frame (not in any map)', () => {
    const result = relevanceScore(makeFrame('f_999'), emptyCtx);
    expect(result.score).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it('confirmed takes precedence over LLM boost', () => {
    const ctx: RelevanceContext = {
      ...emptyCtx,
      confirmedFrameIds: { f_001: true },
      llmHighlightedFrameIds: { f_001: true },
      turnsAgoMap: { f_001: 0 },
    };
    const result = relevanceScore(makeFrame('f_001'), ctx);
    expect(result.score).toBe(1.0);
    expect(result.reasons[0].signal).toBe('confirmed');
  });

  // New signal tests

  it('touch frequency boosts frames discussed multiple times', () => {
    const ctx: RelevanceContext = { ...emptyCtx, touchCountMap: { f_001: 4 } };
    const result = relevanceScore(makeFrame('f_001'), ctx);
    // min(4/5, 1.0) * 0.7 = 0.56
    expect(result.score).toBeCloseTo(0.56, 2);
    expect(result.reasons[0].signal).toBe('touch_frequency');
    expect(result.reasons[0].reason).toBe('Discussed 4 times');
  });

  it('touch frequency caps at 5 touches', () => {
    const ctx: RelevanceContext = { ...emptyCtx, touchCountMap: { f_001: 10 } };
    const result = relevanceScore(makeFrame('f_001'), ctx);
    // min(10/5, 1.0) * 0.7 = 0.7
    expect(result.score).toBeCloseTo(0.7, 2);
  });

  it('relation degree boosts well-connected frames', () => {
    const ctx: RelevanceContext = { ...emptyCtx, relationDegreeMap: { f_001: 2 } };
    const result = relevanceScore(makeFrame('f_001'), ctx);
    // min(2/3, 1.0) * 0.6 = 0.4
    expect(result.score).toBeCloseTo(0.4, 2);
    expect(result.reasons[0].signal).toBe('relation_degree');
    expect(result.reasons[0].reason).toBe('Connected to 2 other frames');
  });

  it('frame confidence contributes to score', () => {
    const ctx: RelevanceContext = { ...emptyCtx };
    const result = relevanceScore(makeFrame('f_001', 0.9), ctx);
    // 0.9 * 0.5 = 0.45
    expect(result.score).toBeCloseTo(0.45, 2);
    expect(result.reasons[0].signal).toBe('confidence');
  });

  it('reasons are sorted by value descending', () => {
    const ctx: RelevanceContext = {
      ...emptyCtx,
      turnsAgoMap: { f_001: 1 }, // 0.7
      touchCountMap: { f_001: 5 }, // 0.7
      relationDegreeMap: { f_001: 3 }, // 0.6
    };
    const result = relevanceScore(makeFrame('f_001', 0.8), ctx);
    expect(result.reasons[0].value).toBeGreaterThanOrEqual(result.reasons[1].value);
    expect(result.reasons[1].value).toBeGreaterThanOrEqual(result.reasons[2].value);
  });

  it('multiple signals combine — score is max of all', () => {
    const ctx: RelevanceContext = {
      ...emptyCtx,
      turnsAgoMap: { f_001: 3 }, // 0.7^3 = 0.343
      touchCountMap: { f_001: 3 }, // 0.42
      relationDegreeMap: { f_001: 2 }, // 0.4
    };
    const result = relevanceScore(makeFrame('f_001', 0.6), ctx);
    // max(0.343, 0.42, 0.4, 0.3) = 0.42 (touch_frequency wins)
    expect(result.score).toBeCloseTo(0.42, 2);
    expect(result.reasons[0].signal).toBe('touch_frequency');
  });
});
