import type { Source } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildSourceMap, type WorkspaceTurn } from '../sourceMap';

const T1 = 'sha256:turn1';
const T2 = 'sha256:turn2';
const turns: WorkspaceTurn[] = [
  { turn_hash: T1, content: 'I want to visit Hangzhou for 5 days' },
  { turn_hash: T2, content: 'Stay at Grandmas Kitchen restaurant' },
];

function llm(turn_hash: string, quote: string, start: number, end: number): Source {
  return {
    type: 'llm',
    model: 'claude',
    at: '2026-04-12T00:00:00Z',
    turn_ref: { turn_hash, quote, start_char: start, end_char: end },
  };
}

describe('buildSourceMap', () => {
  it('produces a SourceMapping per indexed slot with matching turn', () => {
    const idx = new Map<string, Source>([
      ['trip/destination', llm(T1, 'Hangzhou', 16, 24)],
      ['trip/duration', llm(T1, '5 days', 29, 35)],
      ['trip/dining/restaurant', llm(T2, 'Grandmas Kitchen', 9, 25)],
    ]);
    const map = buildSourceMap(idx, turns);

    expect(map.get(1)).toHaveLength(2);
    expect(map.get(2)).toHaveLength(1);

    const t1 = map.get(1)!;
    expect(t1[0].treePath).toBe('trip');
    expect(t1[0].slotKey).toBe('destination');
    expect(t1[0].start).toBe(16);
    expect(t1[0].quote).toBe('Hangzhou');

    const t2 = map.get(2)!;
    expect(t2[0].treePath).toBe('trip/dining');
    expect(t2[0].slotKey).toBe('restaurant');
  });

  it('skips HumanSource entries (no turn anchor)', () => {
    const idx = new Map<string, Source>([
      ['trip/note', { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' }],
    ]);
    expect(buildSourceMap(idx, turns).size).toBe(0);
  });

  it('skips entries whose turn_hash is not loaded', () => {
    const idx = new Map<string, Source>([['trip/lost', llm('sha256:missing', 'ghost', 0, 5)]]);
    expect(buildSourceMap(idx, turns).size).toBe(0);
  });

  it('skips entries missing char offsets', () => {
    const idx = new Map<string, Source>([
      [
        'trip/x',
        {
          type: 'llm',
          model: 'claude',
          at: '2026-04-12T00:00:00Z',
          turn_ref: { turn_hash: T1, quote: 'x' },
        },
      ],
    ]);
    expect(buildSourceMap(idx, turns).size).toBe(0);
  });

  it('sorts mappings within a turn by start position', () => {
    const idx = new Map<string, Source>([
      ['trip/b', llm(T1, 'days', 30, 34)],
      ['trip/a', llm(T1, 'Hangzhou', 16, 24)],
    ]);
    const t1 = buildSourceMap(idx, turns).get(1)!;
    expect(t1.map((m) => m.start)).toEqual([16, 30]);
  });

  it('treats root-only paths as treePath with null slotKey', () => {
    const idx = new Map<string, Source>([['trip', llm(T1, 'Hangzhou', 0, 8)]]);
    const m = buildSourceMap(idx, turns).get(1)!;
    expect(m[0].treePath).toBe('trip');
    expect(m[0].slotKey).toBeNull();
  });
});
