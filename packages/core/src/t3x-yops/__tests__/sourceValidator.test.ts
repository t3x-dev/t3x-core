import { describe, expect, it } from 'vitest';
import { repairOpQuotes, type ValidationTurn, validateSource } from '../sourceValidator';
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

  it('rejects op with unrecognized source type', () => {
    const op = {
      set: { path: 'x', value: 'y' },
      source: { type: 'robot', foo: 'bar' },
    } as unknown as SourcedYOp;
    const result = validateSource([op], [turn]);
    expect(result.ok).toBe(false);
    expect(result.failingOps[0].reason).toBe('invalid_source_type');
  });

  it('rejects LLM source with empty quote', () => {
    const op = {
      set: { path: 'x', value: 'y' },
      source: {
        type: 'llm',
        model: 'm',
        at: '2026-04-12T00:00:00Z',
        turn_ref: { turn_hash: 'sha256:abc', quote: '' },
      },
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
        type: 'llm',
        model: 'm',
        at: '2026-04-12T00:00:00Z',
        turn_ref: { turn_hash: 'sha256:abc', quote: 'not present' },
      },
    };
    const result = validateSource([bad, bad, bad], [turn]);
    expect(result.ok).toBe(false);
    expect(result.failingOps).toHaveLength(3);
  });
});

describe('repairOpQuotes', () => {
  it('repairs straight apostrophes to exact curly-apostrophe substrings', () => {
    const turns: ValidationTurn[] = [
      {
        turn_hash: 'sha256:def',
        content: 'Here’s a suggested itinerary for your 5-day stay.',
      },
    ];
    const ops: SourcedYOp[] = [
      {
        define: { path: 'trip/itinerary' },
        source: {
          type: 'llm',
          model: 'm',
          at: '2026-04-12T00:00:00Z',
          turn_ref: {
            turn_hash: 'sha256:def',
            quote: "Here's a suggested itinerary for your 5-day stay.",
          },
        },
      },
    ];

    repairOpQuotes(ops, turns);

    const src = ops[0].source;
    if (src?.type !== 'llm') throw new Error('expected llm source');
    expect(src.turn_ref.quote).toBe('Here’s a suggested itinerary for your 5-day stay.');
    expect(validateSource(ops, turns).ok).toBe(true);
  });

  it('repairs markdown heading prefixes for quoted section titles', () => {
    const turns: ValidationTurn[] = [
      {
        turn_hash: 'sha256:def',
        content: '### Budget Breakdown (Estimated):\nAccommodation: 750-1500 yuan',
      },
    ];
    const ops: SourcedYOp[] = [
      {
        define: { path: 'trip/budget_breakdown' },
        source: {
          type: 'llm',
          model: 'm',
          at: '2026-04-12T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:def', quote: '### Budget Breakdown (Estimated)' },
        },
      },
    ];

    repairOpQuotes(ops, turns);

    const src = ops[0].source;
    if (src?.type !== 'llm') throw new Error('expected llm source');
    expect(validateSource(ops, turns).ok).toBe(true);
  });

  describe('case + whitespace + punctuation tolerance (small-model failure modes)', () => {
    // gpt-5.4-nano and gemini-3.1-flash-lite consistently emit quotes
    // that differ from the prompt content by casing, whitespace
    // collapse, or trailing punctuation. The repair pass needs to
    // recover these without breaking the audit-trail invariant
    // ('repaired quote is a verbatim substring of content').

    it('repairs lowercased quote against mixed-case content', () => {
      const turns: ValidationTurn[] = [
        { turn_hash: 'sha256:cam', content: 'Choose A7R5 if you want maximum detail' },
      ];
      const ops: SourcedYOp[] = [
        {
          set: { path: 'cameras/a7r_v', value: 'maximum detail' },
          source: {
            type: 'llm',
            model: 'gpt-5.4-nano',
            at: '2026-04-26T00:00:00Z',
            // Model emitted lowercased — content has 'A7R5'.
            turn_ref: { turn_hash: 'sha256:cam', quote: 'choose a7r5 if you want' },
          },
        },
      ];

      repairOpQuotes(ops, turns);

      const src = ops[0].source;
      if (src?.type !== 'llm') throw new Error('expected llm source');
      // The repaired quote is the ORIGINAL casing from the content.
      expect(src.turn_ref.quote).toBe('Choose A7R5 if you want');
      expect(validateSource(ops, turns).ok).toBe(true);
    });

    it('repairs collapsed-whitespace quote against multi-space content', () => {
      // Content has a line break + indent (common with bullet lists);
      // model collapsed it to a single space.
      const turns: ValidationTurn[] = [
        { turn_hash: 'sha256:bullet', content: '- Want highest resolution\n  for landscapes' },
      ];
      const ops: SourcedYOp[] = [
        {
          set: { path: 'feature/highest_resolution', value: 'landscapes' },
          source: {
            type: 'llm',
            model: 'gemini-3.1-flash-lite',
            at: '2026-04-26T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:bullet',
              quote: 'Want highest resolution for landscapes',
            },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      const src = ops[0].source;
      if (src?.type !== 'llm') throw new Error('expected llm source');
      // Repaired quote is the original-whitespace substring from content.
      expect(src.turn_ref.quote).toBe('Want highest resolution\n  for landscapes');
      expect(validateSource(ops, turns).ok).toBe(true);
    });

    it('repairs casing AND whitespace simultaneously', () => {
      const turns: ValidationTurn[] = [
        { turn_hash: 'sha256:t', content: 'Sony A7R V\nis the high-resolution specialist' },
      ];
      const ops: SourcedYOp[] = [
        {
          set: { path: 'sony/a7r_v', value: 'high-resolution specialist' },
          source: {
            type: 'llm',
            model: 'gpt-5.4-nano',
            at: '2026-04-26T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:t',
              // lowercased + collapsed whitespace
              quote: 'sony a7r v is the high-resolution specialist',
            },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      const src = ops[0].source;
      if (src?.type !== 'llm') throw new Error('expected llm source');
      expect(src.turn_ref.quote).toBe('Sony A7R V\nis the high-resolution specialist');
      expect(validateSource(ops, turns).ok).toBe(true);
    });

    it('strips trailing punctuation when model adds a period the source lacks', () => {
      const turns: ValidationTurn[] = [
        { turn_hash: 'sha256:p', content: 'Choose A7R5 if you want maximum detail' },
      ];
      const ops: SourcedYOp[] = [
        {
          set: { path: 'choice/a7r5', value: 'maximum detail' },
          source: {
            type: 'llm',
            model: 'gpt-5.4-nano',
            at: '2026-04-26T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:p',
              quote: 'Choose A7R5 if you want maximum detail.', // trailing period
            },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      const src = ops[0].source;
      if (src?.type !== 'llm') throw new Error('expected llm source');
      // The trimmed-punctuation candidate is a substring of content;
      // that's what gets recorded as the repaired quote.
      expect(src.turn_ref.quote).toBe('Choose A7R5 if you want maximum detail');
      expect(validateSource(ops, turns).ok).toBe(true);
    });

    it('strips leading bracket when model wraps a fragment', () => {
      const turns: ValidationTurn[] = [
        { turn_hash: 'sha256:b', content: 'A7R V is great for landscapes' },
      ];
      const ops: SourcedYOp[] = [
        {
          set: { path: 'a7r_v/use_case', value: 'landscapes' },
          source: {
            type: 'llm',
            model: 'gpt-5.4-nano',
            at: '2026-04-26T00:00:00Z',
            // model added a leading paren wrap
            turn_ref: { turn_hash: 'sha256:b', quote: '(A7R V is great for landscapes' },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      const src = ops[0].source;
      if (src?.type !== 'llm') throw new Error('expected llm source');
      expect(src.turn_ref.quote).toBe('A7R V is great for landscapes');
      expect(validateSource(ops, turns).ok).toBe(true);
    });

    it('does NOT repair when the quote is genuinely not in content (no false positives)', () => {
      // Defensive: a quote that's actually wrong (paraphrase sharing no
      // key tokens) must STILL fail validation. The repair pass extends
      // tolerance for surface variation, not for hallucination.
      const turns: ValidationTurn[] = [
        { turn_hash: 'sha256:f', content: 'Sony A7R V is great for landscapes' },
      ];
      const ops: SourcedYOp[] = [
        {
          set: { path: 'a7r_v/use_case', value: 'studio' },
          source: {
            type: 'llm',
            model: 'gpt-5.4-nano',
            at: '2026-04-26T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:f',
              // Hallucinated — not in content at all.
              quote: 'A7R V is excellent for studio portraiture',
            },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      // Quote unchanged (no candidate matched), validation fails.
      expect(validateSource(ops, turns).ok).toBe(false);
    });
  });
});
