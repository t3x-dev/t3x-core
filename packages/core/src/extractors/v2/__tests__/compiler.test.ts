import { describe, expect, it } from 'vitest';
import { compileExtractionDraft } from '../compiler';
import { EXTRACTION_DRAFT_SCHEMA, type ExtractionDraft } from '../types';

const bootstrapDraft: ExtractionDraft = {
  schema: EXTRACTION_DRAFT_SCHEMA,
  version: 1,
  mode: 'bootstrap',
  items: [
    {
      id: 'item_1',
      intent: 'add',
      confidence: 0.92,
      reasoning_type: 'direct',
      candidate: {
        key: 'airport_issue',
        values: {
          summary: 'SEA had a cyberattack',
          status: 'stabilized',
        },
      },
      evidence: [
        {
          turn_tag: 'T1',
          quote:
            'Seattle-Tacoma International Airport (SEA) has been dealing with a major, ongoing crisis',
          role: 'primary',
        },
      ],
    },
  ],
};

describe('extractors/v2 compiler', () => {
  it('lowers a bootstrap draft into a stable sourced YOps sequence', () => {
    const result = compileExtractionDraft({
      draft: bootstrapDraft,
      sourceModel: 'claude-sonnet-4-6',
      extractedAt: '2026-04-19T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ops).toEqual([
      {
        define: { path: 'airport_issue' },
        source: {
          type: 'llm',
          model: 'claude-sonnet-4-6',
          at: '2026-04-19T00:00:00.000Z',
          turn_ref: {
            turn_hash: 'sha256:turn-1',
            quote:
              'Seattle-Tacoma International Airport (SEA) has been dealing with a major, ongoing crisis',
          },
        },
      },
      {
        populate: {
          path: 'airport_issue',
          values: {
            status: 'stabilized',
            summary: 'SEA had a cyberattack',
          },
        },
        source: {
          type: 'llm',
          model: 'claude-sonnet-4-6',
          at: '2026-04-19T00:00:00.000Z',
          turn_ref: {
            turn_hash: 'sha256:turn-1',
            quote:
              'Seattle-Tacoma International Airport (SEA) has been dealing with a major, ongoing crisis',
          },
        },
      },
    ]);
  });

  it('lowers incremental updates deterministically', () => {
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'incremental',
      items: [
        {
          id: 'item_2',
          intent: 'update',
          confidence: 0.88,
          reasoning_type: 'cross_turn',
          target_ref: { path: 'airport_issue' },
          candidate: {
            values: {
              status: 'recovered',
              advisory: 'check with airlines',
            },
          },
          evidence: [
            { turn_tag: 'T2', quote: 'check with their specific airlines', role: 'primary' },
          ],
        },
      ],
    };

    const input = {
      draft,
      sourceModel: 'gpt-5.4',
      extractedAt: '2026-04-19T00:00:00.000Z',
      turnHashByTag: { T2: 'sha256:turn-2' },
    };

    const first = compileExtractionDraft(input);
    const second = compileExtractionDraft(input);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.ops).toEqual([
      {
        populate: {
          path: 'airport_issue',
          values: {
            advisory: 'check with airlines',
            status: 'recovered',
          },
        },
        source: {
          type: 'llm',
          model: 'gpt-5.4',
          at: '2026-04-19T00:00:00.000Z',
          turn_ref: {
            turn_hash: 'sha256:turn-2',
            quote: 'check with their specific airlines',
          },
        },
      },
    ]);
  });

  it('folds duplicate define ops on the same path and warns', () => {
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          candidate: {
            key: 'game',
            values: { title: 'Heroes of the Storm' },
          },
          evidence: [{ turn_tag: 'T1', quote: 'Heroes of the Storm', role: 'primary' }],
        },
        {
          id: 'item_2',
          intent: 'add',
          confidence: 0.85,
          reasoning_type: 'cross_turn',
          candidate: {
            key: 'game',
            values: { genre: 'MOBA' },
          },
          evidence: [{ turn_tag: 'T2', quote: 'HotS is a MOBA', role: 'primary' }],
        },
      ],
    };

    const result = compileExtractionDraft({
      draft,
      sourceModel: 'claude-sonnet-4-6',
      extractedAt: '2026-04-22T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1', T2: 'sha256:turn-2' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const defineOps = result.ops.filter((op) => 'define' in op);
    const populateOps = result.ops.filter((op) => 'populate' in op);

    expect(defineOps).toHaveLength(1);
    expect(defineOps[0]).toMatchObject({ define: { path: 'game' } });
    expect(populateOps).toHaveLength(2);
    expect(populateOps[0]).toMatchObject({
      populate: { path: 'game', values: { title: 'Heroes of the Storm' } },
    });
    expect(populateOps[1]).toMatchObject({
      populate: { path: 'game', values: { genre: 'MOBA' } },
    });

    expect(result.warnings).toContain('Dropped duplicate define op for path "game"');
  });

  it('does not dedupe defines on different paths', () => {
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          candidate: { key: 'game', values: { title: 'Heroes of the Storm' } },
          evidence: [{ turn_tag: 'T1', quote: 'HotS', role: 'primary' }],
        },
        {
          id: 'item_2',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          candidate: { key: 'developer', values: { name: 'Blizzard' } },
          evidence: [{ turn_tag: 'T1', quote: 'Blizzard', role: 'primary' }],
        },
      ],
    };

    const result = compileExtractionDraft({
      draft,
      sourceModel: 'claude-sonnet-4-6',
      extractedAt: '2026-04-22T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const defineOps = result.ops.filter((op) => 'define' in op);
    expect(defineOps).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('synthesizes a path from candidate.values when add is missing key and path_hint', () => {
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_nano_1',
          intent: 'add',
          confidence: 0.8,
          reasoning_type: 'direct',
          candidate: {
            values: { title: 'Signal-to-Noise Strategy', priority: 'high' },
          },
          evidence: [{ turn_tag: 'T1', quote: 'signal to noise', role: 'primary' }],
        },
      ],
    };

    const result = compileExtractionDraft({
      draft,
      sourceModel: 'gpt-5.4-nano',
      extractedAt: '2026-04-22T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const defineOps = result.ops.filter((op) => 'define' in op);
    expect(defineOps).toHaveLength(1);
    // Slug derived from the first short string value — "Signal-to-Noise Strategy".
    expect((defineOps[0] as { define: { path: string } }).define.path).toBe(
      'signal_to_noise_strategy'
    );
    expect(
      result.warnings.some((w) => w.includes('Synthesized path') && w.includes('signal_to_noise'))
    ).toBe(true);
  });

  it('synthesizes a path from item.id when add has no values and no key', () => {
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_bare_nano',
          intent: 'add',
          confidence: 0.5,
          reasoning_type: 'direct',
          candidate: {},
          evidence: [{ turn_tag: 'T1', quote: 'bare', role: 'primary' }],
        },
      ],
    };

    const result = compileExtractionDraft({
      draft,
      sourceModel: 'gpt-5.4-nano',
      extractedAt: '2026-04-22T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const defineOp = result.ops.find((op) => 'define' in op);
    expect((defineOp as { define: { path: string } }).define.path).toBe('item_bare_nano');
  });

  it('promotes update to add in bootstrap mode (path comes from target_ref)', () => {
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_promo',
          intent: 'update',
          confidence: 0.85,
          reasoning_type: 'cross_turn',
          target_ref: { path: 'strict_mode' },
          candidate: { values: { note: 'double-invokes effects' } },
          evidence: [{ turn_tag: 'T1', quote: 'strict mode double invokes', role: 'primary' }],
        },
      ],
    };

    const result = compileExtractionDraft({
      draft,
      sourceModel: 'gpt-5.4-nano',
      extractedAt: '2026-04-22T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const kinds = result.ops.map((op) => Object.keys(op).filter((k) => k !== 'source')[0]);
    expect(kinds).toContain('define');
    expect(kinds).toContain('populate');

    const define = result.ops.find((op) => 'define' in op) as { define: { path: string } };
    expect(define.define.path).toBe('strict_mode');

    expect(
      result.warnings.some((w) => w.includes('Promoted update to add in bootstrap mode'))
    ).toBe(true);
  });

  it('does not promote update in incremental mode', () => {
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'incremental',
      items: [
        {
          id: 'item_inc',
          intent: 'update',
          confidence: 0.85,
          reasoning_type: 'cross_turn',
          target_ref: { path: 'existing_node' },
          candidate: { values: { note: 'refined' } },
          evidence: [{ turn_tag: 'T1', quote: 'refined', role: 'primary' }],
        },
      ],
    };

    const result = compileExtractionDraft({
      draft,
      sourceModel: 'claude-sonnet-4-6',
      extractedAt: '2026-04-22T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const kinds = result.ops.map((op) => Object.keys(op).filter((k) => k !== 'source')[0]);
    // Incremental update should NOT emit define — it assumes the node exists.
    expect(kinds).not.toContain('define');
    expect(kinds).toContain('populate');
    expect(result.warnings).not.toContain(
      expect.stringContaining('Promoted update to add in bootstrap mode')
    );
  });

  it('returns a typed compile failure for unsupported draft shapes', () => {
    const result = compileExtractionDraft({
      draft: {
        schema: EXTRACTION_DRAFT_SCHEMA,
        version: 1,
        mode: 'incremental',
        items: [
          {
            id: 'item_3',
            intent: 'update',
            confidence: 0.5,
            reasoning_type: 'direct',
            candidate: {},
            evidence: [{ turn_tag: 'T1', quote: 'bare update', role: 'primary' }],
          },
        ],
      },
      sourceModel: 'claude-sonnet-4-6',
      extractedAt: '2026-04-19T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.failure.code).toBe('compile');
    // Incremental update with no target_ref and no candidate values is genuinely
    // unresolvable — we cannot know which node to update.
    expect(result.failure.message).toContain('update');
  });
});
