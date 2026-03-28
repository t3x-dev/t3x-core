import { describe, expect, it } from 'vitest';
import { computeSessionContext, decideAction } from '../sessionStateManager';
import type { SessionContext } from '../types';

describe('decideAction', () => {
  it('returns wait when turnCount is 0', () => {
    const ctx: SessionContext = { turnCount: 0, extractionCount: 0, lastExtractionTurnCount: 0 };
    expect(decideAction(ctx)).toBe('wait');
  });

  it('returns skip when no new turns since last extraction', () => {
    const ctx: SessionContext = { turnCount: 5, extractionCount: 2, lastExtractionTurnCount: 5 };
    expect(decideAction(ctx)).toBe('skip');
  });

  it('returns wait on first extraction with only 1 turn', () => {
    const ctx: SessionContext = { turnCount: 1, extractionCount: 0, lastExtractionTurnCount: 0 };
    expect(decideAction(ctx)).toBe('wait');
  });

  it('returns extract on first extraction with 2 turns', () => {
    const ctx: SessionContext = { turnCount: 2, extractionCount: 0, lastExtractionTurnCount: 0 };
    expect(decideAction(ctx)).toBe('extract');
  });

  it('returns extract when there are new turns', () => {
    const ctx: SessionContext = { turnCount: 8, extractionCount: 3, lastExtractionTurnCount: 6 };
    expect(decideAction(ctx)).toBe('extract');
  });

  it('returns extract on second extraction with 1 new turn', () => {
    const ctx: SessionContext = { turnCount: 3, extractionCount: 1, lastExtractionTurnCount: 2 };
    expect(decideAction(ctx)).toBe('extract');
  });

  it('rule priority: turnCount 0 takes precedence over other checks', () => {
    const ctx: SessionContext = { turnCount: 0, extractionCount: 5, lastExtractionTurnCount: 0 };
    expect(decideAction(ctx)).toBe('wait');
  });

  it('rule priority: skip takes precedence over extract', () => {
    const ctx: SessionContext = { turnCount: 10, extractionCount: 5, lastExtractionTurnCount: 10 };
    expect(decideAction(ctx)).toBe('skip');
  });
});

describe('computeSessionContext', () => {
  it('counts pipeline and llm_extraction sources as extractions', () => {
    const sources = ['pipeline', 'llm_extraction', 'manual', 'pipeline'];
    const ctx = computeSessionContext(sources, 5, 8);
    expect(ctx.extractionCount).toBe(3);
    expect(ctx.lastExtractionTurnCount).toBe(5);
    expect(ctx.turnCount).toBe(8);
  });

  it('returns 0 extraction count for empty yops log', () => {
    const ctx = computeSessionContext([], 0, 3);
    expect(ctx.extractionCount).toBe(0);
    expect(ctx.lastExtractionTurnCount).toBe(0);
    expect(ctx.turnCount).toBe(3);
  });

  it('ignores non-extraction sources', () => {
    const sources = ['manual', 'answer', 'collapse', 'commit_marker'];
    const ctx = computeSessionContext(sources, 4, 6);
    expect(ctx.extractionCount).toBe(0);
  });

  it('integrates with decideAction for cold start', () => {
    const ctx = computeSessionContext([], 0, 1);
    expect(decideAction(ctx)).toBe('wait');
  });

  it('integrates with decideAction for ready state', () => {
    const ctx = computeSessionContext(['pipeline', 'pipeline'], 4, 6);
    expect(decideAction(ctx)).toBe('extract');
  });

  it('integrates with decideAction for skip (no new turns)', () => {
    const ctx = computeSessionContext(['pipeline'], 5, 5);
    expect(decideAction(ctx)).toBe('skip');
  });
});
