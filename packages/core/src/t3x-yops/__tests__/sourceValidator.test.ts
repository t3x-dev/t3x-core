import { describe, expect, it } from 'vitest';
import { validateSource, type ValidationTurn } from '../sourceValidator';
import type { SourcedYOp } from '../types';

const turn: ValidationTurn = {
  turn_hash: 'sha256:abc',
  content: 'The budget is ten thousand dollars.',
};

describe('validateSource', () => {
  it('accepts valid LLM op with verbatim quote', () => {
    const op: SourcedYOp = {
      set: { path: 'trip/budget', value: 'ten thousand' },
      source: {
        type: 'llm',
        model: 'claude-sonnet-4-6',
        at: '2026-04-12T00:00:00Z',
        turn_ref: { turn_hash: 'sha256:abc', quote: 'ten thousand dollars' },
      },
    };
    const result = validateSource([op], [turn]);
    expect(result.ok).toBe(true);
    expect(result.failingOps).toHaveLength(0);
  });

  it('rejects LLM op with quote not in turn', () => {
    const op: SourcedYOp = {
      set: { path: 'trip/budget', value: 'ten thousand' },
      source: {
        type: 'llm',
        model: 'claude-sonnet-4-6',
        at: '2026-04-12T00:00:00Z',
        turn_ref: { turn_hash: 'sha256:abc', quote: 'twenty thousand' },
      },
    };
    const result = validateSource([op], [turn]);
    expect(result.ok).toBe(false);
    expect(result.failingOps).toHaveLength(1);
    expect(result.failingOps[0].reason).toBe('unverifiable_quote');
  });

  it('rejects LLM op with unknown turn_hash', () => {
    const op: SourcedYOp = {
      set: { path: 'trip/budget', value: 'ten thousand' },
      source: {
        type: 'llm',
        model: 'claude-sonnet-4-6',
        at: '2026-04-12T00:00:00Z',
        turn_ref: { turn_hash: 'sha256:unknown', quote: 'anything' },
      },
    };
    const result = validateSource([op], [turn]);
    expect(result.ok).toBe(false);
    expect(result.failingOps[0].reason).toBe('unknown_turn_hash');
  });

  it('rejects op with missing source', () => {
    const op = { set: { path: 'trip/budget', value: 'x' } } as unknown as SourcedYOp;
    const result = validateSource([op], [turn]);
    expect(result.ok).toBe(false);
    expect(result.failingOps[0].reason).toBe('missing_source');
  });

  it('rejects LLM source with empty quote', () => {
    const op = {
      set: { path: 'x', value: 'y' },
      source: { type: 'llm', model: 'm', at: '2026-04-12T00:00:00Z', turn_ref: { turn_hash: 'sha256:abc', quote: '' } },
    } as SourcedYOp;
    const result = validateSource([op], [turn]);
    expect(result.ok).toBe(false);
    expect(result.failingOps[0].reason).toBe('unverifiable_quote');
  });

  it('accepts human op with identity only (no turn ref required)', () => {
    const op: SourcedYOp = {
      unset: { path: 'trip/budget' },
      source: { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' },
    };
    const result = validateSource([op], [turn]);
    expect(result.ok).toBe(true);
  });

  it('rejects human op without author', () => {
    const op = {
      unset: { path: 'trip/budget' },
      source: { type: 'human', author: '', at: '2026-04-12T00:00:00Z' },
    } as SourcedYOp;
    const result = validateSource([op], [turn]);
    expect(result.ok).toBe(false);
    expect(result.failingOps[0].reason).toBe('missing_author');
  });

  it('reports all failing ops, not just first', () => {
    const bad: SourcedYOp = {
      set: { path: 'x', value: 'y' },
      source: {
        type: 'llm', model: 'm', at: '2026-04-12T00:00:00Z',
        turn_ref: { turn_hash: 'sha256:abc', quote: 'not present' },
      },
    };
    const result = validateSource([bad, bad, bad], [turn]);
    expect(result.ok).toBe(false);
    expect(result.failingOps).toHaveLength(3);
  });
});
