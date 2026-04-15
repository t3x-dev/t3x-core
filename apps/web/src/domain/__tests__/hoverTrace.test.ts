import type { Source } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { traceChatToYaml, traceYamlToChat, type WorkspaceTurn } from '../hoverTrace';

const T1 = 'sha256:turn1';
const T2 = 'sha256:turn2';

const turns: WorkspaceTurn[] = [
  { turn_hash: T1, content: 'I want to visit Hangzhou for 5 days' },
  { turn_hash: T2, content: 'Stay at Grandmas Kitchen restaurant' },
];

function llm(turn_hash: string, quote: string): Source {
  return {
    type: 'llm',
    model: 'claude',
    at: '2026-04-12T00:00:00Z',
    turn_ref: { turn_hash, quote },
  };
}

const sourceIndex = new Map<string, Source>([
  ['trip', llm(T1, 'Hangzhou')],
  ['trip/destination', llm(T1, 'Hangzhou')],
  ['trip/duration', llm(T1, '5 days')],
  ['trip/dining/restaurant', llm(T2, 'Grandmas Kitchen')],
]);

describe('traceYamlToChat', () => {
  it('returns the exact slot source + quote when slot key is hovered', () => {
    const r = traceYamlToChat(sourceIndex, turns, 'trip', 'destination');
    expect(r.sourceTurnIndex).toBe(1);
    expect(r.quote).toBe('Hangzhou');
    expect(r.allQuotes).toEqual(['Hangzhou']);
  });

  it('walks ancestors when the exact slot path is not indexed', () => {
    const r = traceYamlToChat(sourceIndex, turns, 'trip', 'unknown_slot');
    expect(r.sourceTurnIndex).toBe(1);
    expect(r.quote).toBe('Hangzhou');
  });

  it('collects descendant quotes for a node header hover', () => {
    const r = traceYamlToChat(sourceIndex, turns, 'trip', null);
    expect(r.quote).toBeNull();
    // 'trip' and 'trip/destination' both point at "Hangzhou" — duplicates are expected
    expect(new Set(r.allQuotes)).toEqual(new Set(['Hangzhou', '5 days', 'Grandmas Kitchen']));
    expect(r.sourceTurnIndex).toBe(1);
  });

  it('returns nulls when no source exists for the path', () => {
    const empty = new Map<string, Source>();
    const r = traceYamlToChat(empty, turns, 'trip', 'destination');
    expect(r.sourceTurnIndex).toBeNull();
    expect(r.quote).toBeNull();
    expect(r.allQuotes).toEqual([]);
  });

  it('returns null turn index when the source turn_hash is no longer loaded', () => {
    const orphan = new Map<string, Source>([['trip/x', llm('sha256:missing', 'x')]]);
    const r = traceYamlToChat(orphan, turns, 'trip', 'x');
    expect(r.sourceTurnIndex).toBeNull();
    expect(r.quote).toBe('x');
  });

  it('ignores HumanSource for quote (humans do not cite turns)', () => {
    const human = new Map<string, Source>([
      ['trip/dest', { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' }],
    ]);
    const r = traceYamlToChat(human, turns, 'trip', 'dest');
    expect(r.sourceTurnIndex).toBeNull();
    expect(r.quote).toBeNull();
  });
});

describe('traceChatToYaml', () => {
  it('lists every indexed path whose source points at the given turn', () => {
    const paths = traceChatToYaml(sourceIndex, turns, 1).sort();
    expect(paths).toEqual(['trip', 'trip/destination', 'trip/duration']);
  });

  it('returns only the T2 path for turn 2', () => {
    expect(traceChatToYaml(sourceIndex, turns, 2)).toEqual(['trip/dining/restaurant']);
  });

  it('returns empty when the turn index is out of bounds', () => {
    expect(traceChatToYaml(sourceIndex, turns, 99)).toEqual([]);
  });
});
