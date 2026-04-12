import type { Source, TreeNode } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { enrichTreesWithSourceRefs } from '../enrichSourceRefs';

const CONV = 'conv_abc';
const T1 = 'sha256:turn1';
const T2 = 'sha256:turn2';

function llm(turn_hash: string, quote: string, start: number, end: number): Source {
  return {
    type: 'llm',
    model: 'claude',
    at: '2026-04-12T00:00:00Z',
    turn_ref: { turn_hash, quote, start_char: start, end_char: end },
  };
}

function tree(): TreeNode[] {
  return [
    {
      key: 'trip',
      slots: { destination: 'Hangzhou', duration: '5 days' },
      children: [
        {
          key: 'dining',
          slots: { restaurant: 'Grandmas Kitchen' },
          children: [],
        },
      ],
    },
  ];
}

describe('enrichTreesWithSourceRefs', () => {
  it('injects source_ref from LLMSource at the owning node', () => {
    const idx = new Map<string, Source>([
      ['trip/destination', llm(T1, 'Hangzhou', 16, 24)],
    ]);
    const [root] = enrichTreesWithSourceRefs(tree(), CONV, idx);
    expect(root.slots.source_ref).toEqual({
      conversation_id: CONV,
      turn_hash: T1,
      start_char: 16,
      end_char: 24,
    });
  });

  it('descends into children for nested slot paths', () => {
    const idx = new Map<string, Source>([
      ['trip/dining/restaurant', llm(T2, 'Grandmas Kitchen', 9, 25)],
    ]);
    const [root] = enrichTreesWithSourceRefs(tree(), CONV, idx);
    expect(root.slots.source_ref).toBeUndefined();
    expect(root.children[0].slots.source_ref).toEqual({
      conversation_id: CONV,
      turn_hash: T2,
      start_char: 9,
      end_char: 25,
    });
  });

  it('does not mutate the input trees', () => {
    const original = tree();
    const idx = new Map<string, Source>([
      ['trip/destination', llm(T1, 'Hangzhou', 16, 24)],
    ]);
    enrichTreesWithSourceRefs(original, CONV, idx);
    expect(original[0].slots.source_ref).toBeUndefined();
  });

  it('skips HumanSource entries (no turn anchor)', () => {
    const idx = new Map<string, Source>([
      [
        'trip/destination',
        { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' },
      ],
    ]);
    const [root] = enrichTreesWithSourceRefs(tree(), CONV, idx);
    expect(root.slots.source_ref).toBeUndefined();
  });

  it('skips entries without char offsets', () => {
    const idx = new Map<string, Source>([
      [
        'trip/destination',
        {
          type: 'llm',
          model: 'claude',
          at: '2026-04-12T00:00:00Z',
          turn_ref: { turn_hash: T1, quote: 'Hangzhou' },
        },
      ],
    ]);
    const [root] = enrichTreesWithSourceRefs(tree(), CONV, idx);
    expect(root.slots.source_ref).toBeUndefined();
  });

  it('returns input unchanged when the index is empty', () => {
    const input = tree();
    const out = enrichTreesWithSourceRefs(input, CONV, new Map());
    expect(out).toBe(input);
  });

  it('pins the first LLMSource per node (last-write-wins prevented)', () => {
    const idx = new Map<string, Source>([
      ['trip/destination', llm(T1, 'Hangzhou', 16, 24)],
      ['trip/duration', llm(T2, '5 days', 29, 35)],
    ]);
    const [root] = enrichTreesWithSourceRefs(tree(), CONV, idx);
    // First entry wins — we only set source_ref once per node
    expect(root.slots.source_ref).toEqual({
      conversation_id: CONV,
      turn_hash: T1,
      start_char: 16,
      end_char: 24,
    });
  });
});
