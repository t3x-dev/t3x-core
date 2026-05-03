import type { SourcedYOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildOpCardModel } from '@/domain/yops/opCardModel';

const HUMAN_AT = '2026-04-26T00:00:00Z';
const LLM_AT = '2026-04-26T00:01:00Z';

function humanSetOp(): SourcedYOp {
  return {
    set: { path: 'trip/destination', value: 'Hangzhou' },
    source: { type: 'human', author: 'alice', at: HUMAN_AT },
  } as SourcedYOp;
}

function llmDefineOp(): SourcedYOp {
  return {
    define: { path: 'sights' },
    source: {
      type: 'llm',
      model: 'gpt-4o-mini',
      at: LLM_AT,
      turn_ref: {
        turn_hash: 'sha256:abcdef1234567890',
        quote: 'sights and attractions',
        start_char: 12,
        end_char: 34,
      },
    },
  } as SourcedYOp;
}

function relateOp(): SourcedYOp {
  return {
    relate: { from: 'trip/destination', to: 'trip/budget', type: 'requires' },
    source: { type: 'human', author: 'alice', at: HUMAN_AT },
  } as SourcedYOp;
}

describe('buildOpCardModel', () => {
  it('produces a structured model from a human set op', () => {
    const m = buildOpCardModel(humanSetOp());
    expect(m.verb).toBe('set');
    expect(m.path).toBe('trip/destination');
    expect(m.summary).toContain('trip.destination');
    expect(m.source).toEqual({
      kind: 'human',
      at: HUMAN_AT,
      attribution: 'alice',
    });
    // Human ops never carry provenance — that lives on LLM turn refs.
    expect(m.provenance).toBeNull();
  });

  it('promotes LLM provenance into a structured object the card can render', () => {
    const m = buildOpCardModel(llmDefineOp());
    expect(m.verb).toBe('define');
    expect(m.path).toBe('sights');
    expect(m.source.kind).toBe('llm');
    expect(m.source.attribution).toBe('gpt-4o-mini');
    expect(m.provenance).toEqual({
      turnHash: 'sha256:abcdef1234567890',
      quote: 'sights and attractions',
      startChar: 12,
      endChar: 34,
    });
  });

  it('extracts the `from` endpoint as path for relate ops', () => {
    const m = buildOpCardModel(relateOp());
    expect(m.verb).toBe('relate');
    // `relate` carries endpoints under `from` / `to` rather than `path`.
    // The card uses `from` as the primary path so the chip renders the
    // source side of the relation.
    expect(m.path).toBe('trip/destination');
  });

  it('includes pretty YAML in rawYaml without the source field', () => {
    const m = buildOpCardModel(humanSetOp());
    expect(m.rawYaml).toContain('set:');
    expect(m.rawYaml).toContain('trip/destination');
    // `source` is rendered separately via chips + provenance section;
    // including it in the raw YAML block would visually duplicate it.
    expect(m.rawYaml).not.toContain('source:');
    expect(m.rawYaml).not.toContain('alice');
  });

  it('produces a stable key combining at + verb + path', () => {
    const m = buildOpCardModel(humanSetOp());
    expect(m.key).toBe(`${HUMAN_AT}-set-trip/destination`);
  });

  it('handles missing turn_ref on an LLM op (rare but possible)', () => {
    const op = {
      define: { path: 'orphan' },
      source: { type: 'llm', model: 'm', at: LLM_AT },
    } as unknown as SourcedYOp;
    const m = buildOpCardModel(op);
    expect(m.source.kind).toBe('llm');
    expect(m.source.attribution).toBe('m');
    // No turn_ref → no provenance object. Card renders without the
    // quote excerpt; disclosure shows model + at only.
    expect(m.provenance).toBeNull();
  });

  it('handles missing model on an LLM op', () => {
    const op = {
      define: { path: 'foo' },
      source: { type: 'llm', at: LLM_AT },
    } as unknown as SourcedYOp;
    const m = buildOpCardModel(op);
    expect(m.source.attribution).toBeNull();
  });
});
