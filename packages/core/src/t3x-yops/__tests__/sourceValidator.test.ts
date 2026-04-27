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

  // ── Markdown source-span repair ──────────────────────────────────────
  // Counterpart to the existing quote-side `**marker** → bare` strategy.
  // Some LLMs emit quotes against the *rendered* text they perceive
  // (no `**`, `*`, `\``) while validation runs against raw turn content
  // that still carries the markers. We project the raw content into a
  // stripped form, search the bad quote there, and map a contiguous
  // hit back to a contiguous *raw* span. Repair must be deterministic
  // (no fuzzy matching) and post-condition is rigid: the repaired
  // quote MUST be a verbatim substring of raw content.
  describe('markdown source-span repair', () => {
    function quoteOfFirst(ops: SourcedYOp[]): string {
      const src = ops[0].source;
      if (src?.type !== 'llm') throw new Error('expected llm source');
      return src.turn_ref.quote;
    }

    it('repairs a quote that drops bold markers from the source turn', () => {
      // Original failing case: assistant turn renders bold inline;
      // small LLM extractor quotes the rendered (stripped) text;
      // raw turn carries `**...**`. Without this repair the quote is
      // not a substring of raw and validation hard-fails.
      const turns: ValidationTurn[] = [
        {
          turn_hash: 'sha256:t1',
          content: "Don't mind **bigger file sizes** and more post-processing",
        },
      ];
      const ops: SourcedYOp[] = [
        {
          define: { path: 'tradeoffs/storage' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-04-27T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:t1',
              quote: 'bigger file sizes and more post-processing',
            },
          },
        },
      ];

      repairOpQuotes(ops, turns);

      // Repair brings the markers back into the quote so it's a real
      // substring of raw turn content. We do NOT assert the exact
      // repaired text — only the load-bearing invariant.
      expect(turns[0].content.includes(quoteOfFirst(ops))).toBe(true);
      expect(validateSource(ops, turns).ok).toBe(true);
    });

    it('handles multiple bold spans in the same sentence', () => {
      const turns: ValidationTurn[] = [
        {
          turn_hash: 'sha256:t1',
          content: 'Pick **A7R5** if you want detail; pick **A7M5** if you want battery life.',
        },
      ];
      const ops: SourcedYOp[] = [
        {
          define: { path: 'pick/criteria' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-04-27T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:t1',
              quote: 'A7R5 if you want detail; pick A7M5 if you want battery life.',
            },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      expect(turns[0].content.includes(quoteOfFirst(ops))).toBe(true);
      expect(validateSource(ops, turns).ok).toBe(true);
    });

    it('picks the first occurrence deterministically when stripped match repeats', () => {
      // Stripped form contains the same span twice; raw bolds both
      // sides differently. Repair must always lock onto the first
      // stripped hit so the same input produces the same repair across
      // runs (no lastIndexOf, no scoring).
      const turns: ValidationTurn[] = [
        {
          turn_hash: 'sha256:t1',
          content: '**foo** bar; **foo** bar',
        },
      ];
      const ops: SourcedYOp[] = [
        {
          define: { path: 'tip/foo' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-04-27T00:00:00Z',
            // Bare 'foo bar' is NOT a substring of raw — forces the
            // markdown projection path, not the cheap as-is check.
            turn_ref: { turn_hash: 'sha256:t1', quote: 'foo bar' },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      expect(turns[0].content.includes(quoteOfFirst(ops))).toBe(true);
      // Match starts at the first content char of the first `**foo**`
      // span and extends past its closing marker into the plain ` bar`
      // tail. Boundary expansion pulls the opening `**` into the slice
      // so the repaired quote is balanced — `**foo** bar`, not the raw
      // `foo** bar` substring (which would be visibly malformed in the
      // YOps panel even though it satisfies `rawContent.includes`).
      // The first/second-match contract is locked by anchoring on the
      // FIRST stripped hit (raw[0..11]), not the second (raw[13..24]).
      expect(quoteOfFirst(ops)).toBe('**foo** bar');
    });

    it('balances markers when the match crosses two paired spans', () => {
      // Reproduces the GPT-5.4-mini regression seen post-#906: without
      // boundary expansion the API returned quotes like
      //   "A7R5 (A7R V)** if you want **maximum detail"
      // — opening `**` of the first span dropped, closing `**` of the
      // second span dropped, but the middle markers preserved. Valid as
      // a raw substring, but malformed evidence visible in the panel.
      const turns: ValidationTurn[] = [
        {
          turn_hash: 'sha256:t1',
          content: 'Choose **A7R5 (A7R V)** if you want **maximum detail**...',
        },
      ];
      const ops: SourcedYOp[] = [
        {
          define: { path: 'pick/criteria' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-04-27T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:t1',
              quote: 'Choose A7R5 (A7R V) if you want maximum detail',
            },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      expect(turns[0].content.includes(quoteOfFirst(ops))).toBe(true);
      // Both `**` pairs are balanced in the repaired quote.
      expect(quoteOfFirst(ops)).toBe('Choose **A7R5 (A7R V)** if you want **maximum detail**');
    });

    it('does not orphan a marker when the match sits strictly inside a span', () => {
      // Match start IS the first content char of `**hello world**`
      // (a candidate for opening expansion), but the match end is
      // also inside the same span. Expanding only the opening would
      // produce `**hello` — unbalanced. Boundary expansion is gated on
      // crossing the span, so this case must leave the slice alone.
      // The bare `hello` is still a verbatim raw substring (it appears
      // inside the bolded span), so validation succeeds.
      const turns: ValidationTurn[] = [
        { turn_hash: 'sha256:t1', content: 'Say **hello world** loudly.' },
      ];
      const ops: SourcedYOp[] = [
        {
          define: { path: 'greet' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-04-27T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'hello' },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      expect(turns[0].content.includes(quoteOfFirst(ops))).toBe(true);
      // No expansion — `**hello` would be invalid.
      expect(quoteOfFirst(ops)).toBe('hello');
    });

    it('does not stitch fragments across a span the model omitted', () => {
      // Stripped is `A and B and C`. Quote `A C` does not appear
      // contiguously in stripped — `indexOf` returns -1 — so repair
      // must abstain rather than hallucinate a span that joins two
      // separate substrings. The op stays failing for the LLM to fix.
      const turns: ValidationTurn[] = [
        {
          turn_hash: 'sha256:t1',
          content: '**A** and **B** and **C**',
        },
      ];
      const ops: SourcedYOp[] = [
        {
          define: { path: 'noncontig' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-04-27T00:00:00Z',
            // Two non-adjacent fragments joined by the model.
            turn_ref: { turn_hash: 'sha256:t1', quote: 'A C' },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      // Quote untouched (still 'A C') and validation still fails.
      expect(quoteOfFirst(ops)).toBe('A C');
      expect(validateSource(ops, turns).ok).toBe(false);
    });

    it('repairs across italic and inline-code markers, not only bold', () => {
      const turns: ValidationTurn[] = [
        {
          turn_hash: 'sha256:t1',
          content: 'Use *care* with the `fetch` API for *streaming* responses.',
        },
      ];
      const ops: SourcedYOp[] = [
        {
          define: { path: 'api/usage' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-04-27T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:t1',
              quote: 'care with the fetch API for streaming responses.',
            },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      expect(turns[0].content.includes(quoteOfFirst(ops))).toBe(true);
      expect(validateSource(ops, turns).ok).toBe(true);
    });

    it('is a no-op when content has no markdown and the quote already matches', () => {
      const turns: ValidationTurn[] = [
        { turn_hash: 'sha256:t1', content: 'Plain text with no markdown markers.' },
      ];
      const ops: SourcedYOp[] = [
        {
          define: { path: 'plain' },
          source: {
            type: 'llm',
            model: 'm',
            at: '2026-04-27T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'Plain text with no markdown markers.' },
          },
        },
      ];

      repairOpQuotes(ops, turns);
      expect(quoteOfFirst(ops)).toBe('Plain text with no markdown markers.');
      expect(validateSource(ops, turns).ok).toBe(true);
    });
  });
});
