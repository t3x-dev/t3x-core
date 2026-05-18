import type { Source } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildSweepOps, findPathsOverlappingSpan } from '@/domain/spanSweep';

function llmSource(turnHash: string, start: number, end: number, quote: string): Source {
  return {
    type: 'llm',
    model: 'test-model',
    at: '2026-04-23T00:00:00Z',
    turn_ref: { turn_hash: turnHash, quote, start_char: start, end_char: end },
  };
}

function quoteOnlySource(turnHash: string, quote: string): Source {
  return {
    type: 'llm',
    model: 'test-model',
    at: '2026-04-23T00:00:00Z',
    turn_ref: { turn_hash: turnHash, quote },
  };
}

const HUMAN_SOURCE: Source = {
  type: 'human',
  author: 'test-user',
  at: '2026-04-23T00:00:00Z',
};

describe('findPathsOverlappingSpan', () => {
  it('returns every LLM-sourced path whose quote range overlaps the span', () => {
    const idx = new Map<string, Source>([
      ['trip/destination', llmSource('t1', 10, 18, 'Hangzhou')], // inside span
      ['trip/month', llmSource('t1', 22, 30, 'late May')], // inside span
      ['trip/travelers', llmSource('t1', 40, 48, 'outside')], // outside span
      ['sights', llmSource('t2', 5, 10, 'other turn')], // wrong turn
    ]);

    const matches = findPathsOverlappingSpan(idx, 't1', 8, 32);
    const paths = matches.map((m) => m.path).sort();
    expect(paths).toEqual(['trip/destination', 'trip/month']);
  });

  it('skips HumanSource entries (no turn_ref available)', () => {
    const idx = new Map<string, Source>([
      ['trip/destination', HUMAN_SOURCE],
      ['trip/month', llmSource('t1', 0, 10, 'Hangzhou')],
    ]);
    const matches = findPathsOverlappingSpan(idx, 't1', 0, 20);
    expect(matches.map((m) => m.path)).toEqual(['trip/month']);
  });

  it('uses half-open overlap semantics (touching is not overlapping)', () => {
    const idx = new Map<string, Source>([
      ['trip/a', llmSource('t1', 10, 20, 'a')], // touches end (20 === start)
      ['trip/b', llmSource('t1', 0, 10, 'b')], // touches start (10 === start)
      ['trip/c', llmSource('t1', 10, 20, 'c')], // inside
    ]);
    const matches = findPathsOverlappingSpan(idx, 't1', 10, 20);
    // Only 'trip/a' and 'trip/c' overlap; 'trip/b' ends at 10 which equals start.
    const paths = matches.map((m) => m.path).sort();
    expect(paths).toEqual(['trip/a', 'trip/c']);
  });

  it('flags root-level paths (no slash) as node matches', () => {
    const idx = new Map<string, Source>([
      ['trip', llmSource('t1', 0, 5, 'trip')],
      ['trip/destination', llmSource('t1', 0, 5, 'trip')],
    ]);
    const matches = findPathsOverlappingSpan(idx, 't1', 0, 10);
    const node = matches.find((m) => m.path === 'trip');
    const slot = matches.find((m) => m.path === 'trip/destination');
    expect(node?.isNode).toBe(true);
    expect(slot?.isNode).toBe(false);
  });

  it('falls back to quote lookup when legacy source refs lack char offsets', () => {
    const idx = new Map<string, Source>([
      ['finance/value', quoteOnlySource('t1', 'providing value people will pay for')],
      ['finance/outside', quoteOnlySource('t1', 'outside quote')],
    ]);
    const content = 'You make money by providing value people will pay for.';
    const start = content.indexOf('value');
    const end = start + 'value'.length;

    const matches = findPathsOverlappingSpan(idx, 't1', start, end, [{ turn_hash: 't1', content }]);

    expect(matches.map((m) => m.path)).toEqual(['finance/value']);
  });
});

describe('buildSweepOps', () => {
  it('emits unset for slot paths and drop for node paths', () => {
    const ops = buildSweepOps([
      { path: 'trip/destination', isNode: false },
      { path: 'sights', isNode: true },
    ]);
    expect(ops).toEqual([{ unset: { path: 'trip/destination' } }, { drop: { path: 'sights' } }]);
  });

  it('dedupes slot ops whose parent node is already being dropped', () => {
    const ops = buildSweepOps([
      { path: 'trip', isNode: true },
      { path: 'trip/destination', isNode: false },
      { path: 'trip/month', isNode: false },
      { path: 'sights/value', isNode: false },
    ]);
    expect(ops).toEqual([{ drop: { path: 'trip' } }, { unset: { path: 'sights/value' } }]);
  });

  it('dedupes duplicate paths so the same op is not emitted twice', () => {
    const ops = buildSweepOps([
      { path: 'trip/destination', isNode: false },
      { path: 'trip/destination', isNode: false },
    ]);
    expect(ops).toEqual([{ unset: { path: 'trip/destination' } }]);
  });

  it('handles an empty match list', () => {
    expect(buildSweepOps([])).toEqual([]);
  });
});
