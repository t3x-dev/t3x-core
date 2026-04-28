import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../../semantic/types';
import { applyYOps } from '../../../t3x-yops/engine';
import { compileExtractionDraft, normalizePath } from '../compiler';
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

  it('rewrites incremental add on an existing baseline node into populate without define', () => {
    const baseline: SemanticContent = {
      trees: [{ key: 'trip', slots: {}, children: [{ key: 'budget', slots: {}, children: [] }] }],
      relations: [],
    };
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'incremental',
      items: [
        {
          id: 'item_existing_node',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          candidate: {
            path_hint: 'trip/budget',
            values: { total: '5000 yuan' },
          },
          evidence: [{ turn_tag: 'T1', quote: 'budget is 5000 yuan', role: 'primary' }],
        },
      ],
    };
    const input = {
      draft,
      sourceModel: 'gpt-5.4',
      extractedAt: '2026-04-28T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
      baseline,
    } as Parameters<typeof compileExtractionDraft>[0] & { baseline: SemanticContent };

    const result = compileExtractionDraft(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops.some((op) => 'define' in op && op.define.path === 'trip/budget')).toBe(false);
    expect(result.ops).toContainEqual(
      expect.objectContaining({
        populate: { path: 'trip/budget', values: { total: '5000 yuan' } },
      })
    );
    expect(result.warnings).toContain(
      'Rewrote add intent for existing baseline node "trip/budget" to update semantics (item item_existing_node)'
    );
  });

  it('routes structured incremental add away from existing baseline slots', () => {
    const baseline: SemanticContent = {
      trees: [
        {
          key: 'travel',
          slots: {},
          children: [
            {
              key: 'destination_trip',
              slots: { budget: 'old budget summary' },
              children: [],
            },
          ],
        },
      ],
      relations: [],
    };
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'incremental',
      items: [
        {
          id: 'item_budget_details',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          candidate: {
            path_hint: 'travel/destination_trip/budget',
            values: {
              simple_meal: '20-35 RMB',
              expected_total: '1,800-2,500 RMB',
            },
          },
          evidence: [{ turn_tag: 'T1', quote: '20-35 RMB', role: 'primary' }],
        },
      ],
    };

    const result = compileExtractionDraft({
      draft,
      baseline,
      sourceModel: 'gpt-5.4',
      extractedAt: '2026-04-28T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.ops.some((op) => 'define' in op && op.define.path === 'travel/destination_trip/budget')
    ).toBe(false);
    expect(result.ops).toContainEqual(
      expect.objectContaining({ define: { path: 'travel/destination_trip/budget_details' } })
    );
    expect(result.ops).toContainEqual(
      expect.objectContaining({
        populate: {
          path: 'travel/destination_trip/budget_details',
          values: {
            expected_total: '1,800-2,500 RMB',
            simple_meal: '20-35 RMB',
          },
        },
      })
    );
    expect(result.warnings).toContain(
      'Routed structured data for existing baseline slot "travel/destination_trip/budget" to "travel/destination_trip/budget_details" (item item_budget_details)'
    );

    const applied = applyYOps(baseline, result.ops);
    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(result.ops.length);
  });

  it('reserves routed detail paths across items in the same compile batch', () => {
    const baseline: SemanticContent = {
      trees: [
        {
          key: 'travel',
          slots: {},
          children: [
            {
              key: 'destination_trip',
              slots: { budget: 'old budget summary' },
              children: [],
            },
          ],
        },
      ],
      relations: [],
    };
    const draft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'incremental',
      items: [
        {
          id: 'item_budget_meals',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          candidate: {
            path_hint: 'travel/destination_trip/budget',
            values: { simple_meal: '20-35 RMB' },
          },
          evidence: [{ turn_tag: 'T1', quote: '20-35 RMB', role: 'primary' }],
        },
        {
          id: 'item_budget_hotels',
          intent: 'add',
          confidence: 0.88,
          reasoning_type: 'direct',
          candidate: {
            path_hint: 'travel/destination_trip/budget',
            values: { hotel_night: '300-500 RMB' },
          },
          evidence: [{ turn_tag: 'T1', quote: '300-500 RMB', role: 'primary' }],
        },
      ],
    };

    const result = compileExtractionDraft({
      draft,
      baseline,
      sourceModel: 'gpt-5.4',
      extractedAt: '2026-04-28T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const definePaths = result.ops.flatMap((op) => ('define' in op ? [op.define.path] : []));
    expect(definePaths).toEqual([
      'travel/destination_trip/budget_details',
      'travel/destination_trip/budget_details_2',
    ]);

    const applied = applyYOps(baseline, result.ops);
    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(result.ops.length);
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

  it('synthesizes a path when add has no key but DOES carry values', () => {
    // The path-synthesis fallback still runs when the model omits both
    // `candidate.key` and `candidate.path_hint` but DOES attach concrete
    // values — there's a real fact to extract, just no path-naming
    // hint. `synthesizeAddPath` slugs the first short string value in
    // `candidate.values` (falling back to `item.id` if none), and the
    // populate hangs under that synthesised path.
    //
    // The completely bare case (no key, no values, no children) is now
    // dropped by the empty-define quality guard — see the
    // 'empty-define quality guard' describe block below for that
    // contract.
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
          // Numeric value, so synthesis can't pick a string slug from
          // values and falls back to item.id — the historical contract
          // this test was originally pinning.
          candidate: { values: { count: 7 } },
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
    // Synthesised path was usable: populate landed under it.
    const populateOp = result.ops.find((op) => 'populate' in op) as
      | { populate: { path: string; values: Record<string, unknown> } }
      | undefined;
    expect(populateOp?.populate.path).toBe('item_bare_nano');
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

  describe('normalizePath', () => {
    it('converts dotted LLM paths into slashed YOps paths', () => {
      // Regression: small models (gpt-5.4-nano, etc.) emit dotted paths.
      // Without normalization the engine treated `characters.main_protagonist`
      // as a single root node whose entire key is the literal string with
      // dots, producing a flat tree that didn't match the user's mental
      // model. After this fix the paths are real nested paths.
      expect(normalizePath('characters.main_protagonist')).toEqual({
        kind: 'ok',
        path: 'characters/main_protagonist',
      });
      expect(normalizePath('story.overview.major_conflicts')).toEqual({
        kind: 'ok',
        path: 'story/overview/major_conflicts',
      });
    });

    it('handles mixed dot/slash separators consistently', () => {
      expect(normalizePath('story.overview/value')).toEqual({
        kind: 'ok',
        path: 'story/overview/value',
      });
      expect(normalizePath('story.overview.soul_reaper/value')).toEqual({
        kind: 'ok',
        path: 'story/overview/soul_reaper/value',
      });
    });

    it('passes through already-correct slashed paths', () => {
      expect(normalizePath('mont_saint_michel/location/test1')).toEqual({
        kind: 'ok',
        path: 'mont_saint_michel/location/test1',
      });
      expect(normalizePath('airport_issue')).toEqual({ kind: 'ok', path: 'airport_issue' });
    });

    it('strips leading/trailing slashes and collapses runs', () => {
      expect(normalizePath('/airport_issue/')).toEqual({ kind: 'ok', path: 'airport_issue' });
      expect(normalizePath('story//overview')).toEqual({ kind: 'ok', path: 'story/overview' });
    });

    it('returns invalid (with reason) for segments that violate SNAKE_CASE_KEY', () => {
      // Uppercase, leading digit, kebab-case, hyphen, etc. all fail. The
      // discriminated result lets compiler callers tell present-but-bad
      // apart from absent — invalid is a hard fail, absent falls through.
      const camel = normalizePath('Camel.Case.Path');
      expect(camel.kind).toBe('invalid');
      if (camel.kind === 'invalid') {
        expect(camel.reason).toMatch(/SNAKE_CASE_KEY/);
        expect(camel.raw).toBe('Camel.Case.Path');
      }

      expect(normalizePath('1starts_with_digit').kind).toBe('invalid');
      expect(normalizePath('kebab-case-key').kind).toBe('invalid');
      expect(normalizePath('UPPER').kind).toBe('invalid');
    });

    it('returns absent for null / undefined / empty / whitespace-only input', () => {
      // These let the caller fall through to the next candidate in the
      // priority chain without generating a compile failure.
      expect(normalizePath(null)).toEqual({ kind: 'absent' });
      expect(normalizePath(undefined)).toEqual({ kind: 'absent' });
      expect(normalizePath('')).toEqual({ kind: 'absent' });
      expect(normalizePath('   ')).toEqual({ kind: 'absent' });
    });

    it('returns invalid (not absent) for separator-only input like "//"', () => {
      // `//` isn't really absent — the caller intended a path, it just
      // collapsed to nothing. Treat as invalid so we don't silently
      // fall through to the next candidate.
      const result = normalizePath('//');
      expect(result.kind).toBe('invalid');
    });
  });

  describe('fail-fast on invalid path candidates (no silent fallback)', () => {
    it('add: invalid candidate.path_hint fails compile and names the field, does not fall through to candidate.key', () => {
      // Pre-fix, an invalid `path_hint` returned null and the compiler
      // moved on to `candidate.key`. The model would never learn its
      // path_hint was wrong, and the resulting tree would be nested
      // under the wrong root. After this fix the compiler returns a
      // typed reaskable failure naming `candidate.path_hint`.
      const result = compileExtractionDraft({
        draft: {
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
                path_hint: 'CamelCasePath', // invalid
                key: 'fallback_key', // would have been used pre-fix
                values: { foo: 'bar' },
              },
              evidence: [{ turn_tag: 'T1', quote: 'q', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('compile');
      expect(result.failure.details?.reaskable).toBe(true);
      expect(result.failure.details?.field).toBe('candidate.path_hint');
      expect(result.failure.details?.invalid_path).toBe('CamelCasePath');
      expect(typeof result.failure.details?.reason).toBe('string');
    });

    it('add: absent candidate.path_hint falls through to candidate.key normally', () => {
      // Absent (undefined) is not invalid — the compiler should walk past
      // it and use the next candidate.
      const result = compileExtractionDraft({
        draft: {
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
                key: 'fallback_key',
                values: { foo: 'bar' },
              },
              evidence: [{ turn_tag: 'T1', quote: 'q', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect((result.ops[0] as { define: { path: string } }).define.path).toBe('fallback_key');
    });

    it('update: invalid target_ref.path fails compile and names the field, does not fall through to path_hint', () => {
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'incremental',
          items: [
            {
              id: 'item_1',
              intent: 'update',
              confidence: 0.9,
              reasoning_type: 'direct',
              target_ref: { path: 'Capital.Path' }, // invalid
              candidate: {
                path_hint: 'fallback_path', // would have been used pre-fix
                values: { foo: 'bar' },
              },
              evidence: [{ turn_tag: 'T1', quote: 'q', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'claude-sonnet-4-6',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.details?.field).toBe('target_ref.path');
      expect(result.failure.details?.invalid_path).toBe('Capital.Path');
      expect(result.failure.details?.reaskable).toBe(true);
    });

    it('remove: invalid target_ref.path fails compile with field name', () => {
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'incremental',
          items: [
            {
              id: 'item_1',
              intent: 'remove',
              confidence: 0.9,
              reasoning_type: 'direct',
              target_ref: { path: 'Has Spaces' },
              candidate: {},
              evidence: [{ turn_tag: 'T1', quote: 'q', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'claude-sonnet-4-6',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.details?.field).toBe('target_ref.path');
      expect(result.failure.details?.invalid_path).toBe('Has Spaces');
    });
  });

  it('compiles dotted candidate.path_hint into a nested YOps path', () => {
    // End-to-end regression for the conv_c80bc8eb shape: the LLM emitted
    // `path_hint: "characters.main_protagonist"` and we want the resulting
    // op to use `characters/main_protagonist` so the workspace renders as
    // a tree, not as a flat root with a literal-dot key.
    const result = compileExtractionDraft({
      draft: {
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
              path_hint: 'characters.main_protagonist',
              values: { name: 'Ichigo Kurosaki' },
            },
            evidence: [{ turn_tag: 'T1', quote: 'Ichigo Kurosaki', role: 'primary' }],
          },
        ],
      },
      sourceModel: 'gpt-5.4-nano',
      extractedAt: '2026-04-25T00:00:00.000Z',
      turnHashByTag: { T1: 'sha256:turn-1' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const definePath = (result.ops[0] as { define: { path: string } }).define.path;
    expect(definePath).toBe('characters/main_protagonist');
    const populatePath = (result.ops[1] as { populate: { path: string } }).populate.path;
    expect(populatePath).toBe('characters/main_protagonist');
  });

  describe('candidate.children compilation', () => {
    it('emits define + populate ops for each child under the parent path', () => {
      // Regression: pre-fix, ProviderDraft normalised `children_json` →
      // `candidate.children` and there were tests asserting the lift, but
      // the compiler ignored the field entirely. Subtrees the model
      // produced disappeared with no warning — silent data loss.
      const result = compileExtractionDraft({
        draft: {
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
                key: 'characters',
                children: [
                  { key: 'main_protagonist', values: { name: 'Ichigo Kurosaki' } },
                  { key: 'rival', values: { name: 'Uryu Ishida' } },
                ],
              },
              evidence: [{ turn_tag: 'T1', quote: 'Ichigo and Uryu', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 1× parent define + 2× (child define + child populate) = 5 ops total.
      // (Parent has no values so no parent populate.)
      const opShapes = result.ops.map((op) => {
        if ('define' in op) return { kind: 'define', path: op.define.path };
        if ('populate' in op) return { kind: 'populate', path: op.populate.path };
        return { kind: 'other' };
      });
      expect(opShapes).toEqual([
        { kind: 'define', path: 'characters' },
        { kind: 'define', path: 'characters/main_protagonist' },
        {
          kind: 'populate',
          path: 'characters/main_protagonist',
        },
        { kind: 'define', path: 'characters/rival' },
        { kind: 'populate', path: 'characters/rival' },
      ]);
    });

    it('drops items where parent and every child are bare defines (empty-define guard)', () => {
      // Previously this case "emitted only define ops" — parent + child
      // both bare. That was exactly the small-model failure mode the
      // empty-define quality guard now filters: structure with no
      // concrete facts is workspace pollution, not extracted knowledge.
      // The item is dropped with a warning; ops list comes back empty.
      // See the dedicated 'empty-define quality guard' describe block
      // for the full contract.
      const result = compileExtractionDraft({
        draft: {
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
                key: 'parent',
                children: [{ key: 'empty_child' }],
              },
              evidence: [{ turn_tag: 'T1', quote: 'parent and child', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops).toEqual([]);
      expect(result.warnings.some((w) => /empty define/i.test(w))).toBe(true);
    });

    it('normalises dotted child keys the same way as parent paths', () => {
      // If the LLM emits `key: 'a.b'` for a child it meant nested too —
      // same bug pattern as parent paths. Normalise rather than reject so
      // we don't lose the data.
      const result = compileExtractionDraft({
        draft: {
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
                key: 'story',
                children: [{ key: 'overview.summary', values: { value: 'short text' } }],
              },
              evidence: [{ turn_tag: 'T1', quote: 'story summary', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Parent define + child define + child populate, child path is nested.
      expect((result.ops[1] as { define: { path: string } }).define.path).toBe(
        'story/overview/summary'
      );
      expect((result.ops[2] as { populate: { path: string } }).populate.path).toBe(
        'story/overview/summary'
      );
    });

    it('returns a reaskable compile failure when a child key fails SNAKE_CASE_KEY', () => {
      const result = compileExtractionDraft({
        draft: {
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
                key: 'parent',
                children: [{ key: 'BadKey' }],
              },
              evidence: [{ turn_tag: 'T1', quote: 'bad', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('compile');
      expect(result.failure.details?.reaskable).toBe(true);
      expect(result.failure.details?.field).toBe('candidate.children[].key');
      expect(result.failure.details?.invalid_key).toBe('BadKey');
    });

    it('treats absent children as a no-op (does not change parent ops)', () => {
      const result = compileExtractionDraft({
        draft: {
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
                key: 'parent',
                values: { foo: 'bar' },
                // no children field at all
              },
              evidence: [{ turn_tag: 'T1', quote: 'parent only', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops).toHaveLength(2);
      expect('define' in result.ops[0]).toBe(true);
      expect('populate' in result.ops[1]).toBe(true);
    });

    it('compiles children on update intent (no longer silently dropped outside add)', () => {
      // Reviewer P2.3: pre-fix the children loop was inside the add branch
      // only. An update or reinforce item with parent values + children
      // would compile without error and silently lose the child subtree.
      // Now the helper is shared across intents.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'incremental',
          items: [
            {
              id: 'item_1',
              intent: 'update',
              confidence: 0.9,
              reasoning_type: 'cross_turn',
              target_ref: { path: 'characters' },
              candidate: {
                values: { count: 4 },
                children: [{ key: 'rival', values: { name: 'Uryu' } }],
              },
              evidence: [{ turn_tag: 'T1', quote: 'add rival', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'claude-sonnet-4-6',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const opShapes = result.ops.map((op) => {
        if ('define' in op) return { kind: 'define', path: op.define.path };
        if ('populate' in op) return { kind: 'populate', path: op.populate.path };
        return { kind: 'other' };
      });
      expect(opShapes).toEqual([
        { kind: 'populate', path: 'characters' },
        { kind: 'define', path: 'characters/rival' },
        { kind: 'populate', path: 'characters/rival' },
      ]);
    });

    it('compiles a reinforce intent that carries only children (no parent values)', () => {
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'incremental',
          items: [
            {
              id: 'item_1',
              intent: 'reinforce',
              confidence: 0.85,
              reasoning_type: 'cross_turn',
              target_ref: { path: 'characters' },
              candidate: {
                children: [{ key: 'mentor', values: { name: 'Urahara' } }],
              },
              evidence: [{ turn_tag: 'T1', quote: 'mentor figure', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'claude-sonnet-4-6',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      // Reinforce with only children should now compile (children are
      // sufficient ops, no longer treated as "no values" failure).
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops.length).toBe(2);
      expect((result.ops[0] as { define: { path: string } }).define.path).toBe('characters/mentor');
      expect((result.ops[1] as { populate: { path: string } }).populate.path).toBe(
        'characters/mentor'
      );
    });

    it('returns reaskable failure on invalid child key under update intent', () => {
      // Same validation contract as add: invalid child key on any intent
      // is a typed compile failure with field-specific reask details.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'incremental',
          items: [
            {
              id: 'item_1',
              intent: 'update',
              confidence: 0.9,
              reasoning_type: 'direct',
              target_ref: { path: 'characters' },
              candidate: {
                values: { ok: 'value' },
                children: [{ key: 'BadKey' }],
              },
              evidence: [{ turn_tag: 'T1', quote: 'bad', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'claude-sonnet-4-6',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('compile');
      expect(result.failure.details?.reaskable).toBe(true);
      expect(result.failure.details?.field).toBe('candidate.children[].key');
    });
  });

  describe('allowPartial: per-item resilience', () => {
    it('keeps every well-formed item and drops the malformed one with a named warning', () => {
      // Repro of the conv_bedc22e9 shape: three add candidates, the
      // middle one carries a child key that fails SNAKE_CASE_KEY (the
      // same shape that produces "invalid candidate.children[].key =
      // '61 megapixels'" in the wild). Strict compile would throw the
      // entire batch; allowPartial keeps items 1 and 3.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'item_good_1',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'sony', values: { availability: 'unreleased' } },
              evidence: [{ turn_tag: 'T1', quote: 'unreleased', role: 'primary' }],
            },
            {
              id: 'item_bad_child_key',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: {
                key: 'specs',
                children: [{ key: '61 megapixels', values: { v: 'x' } }],
              },
              evidence: [{ turn_tag: 'T1', quote: 'spec', role: 'primary' }],
            },
            {
              id: 'item_good_2',
              intent: 'add',
              confidence: 0.8,
              reasoning_type: 'direct',
              candidate: { key: 'canon', values: { model: 'r5' } },
              evidence: [{ turn_tag: 'T1', quote: 'r5', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'claude-sonnet-4-6',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
        allowPartial: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Two surviving items each emit a define + their value sets.
      const defines = result.ops.filter((op) => 'define' in op);
      expect(defines.map((op) => ('define' in op ? op.define.path : ''))).toEqual([
        'sony',
        'canon',
      ]);
      const droppedWarning = result.warnings.find((w) => w.includes('item_bad_child_key'));
      expect(droppedWarning).toBeDefined();
      expect(droppedWarning).toMatch(/61 megapixels/);
    });

    it('returns ok with empty ops + warnings when every item is malformed', () => {
      // The pipeline distinguishes "partial yielded zero ops" from
      // "partial yielded some" — when every item fails, allowPartial is
      // still ok:true, but the caller (pipeline) checks ops.length and
      // falls back to surfacing the original failure. Lock the contract.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'bad_a',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'parent', children: [{ key: 'BadKey' }] },
              evidence: [{ turn_tag: 'T1', quote: 'x', role: 'primary' }],
            },
            {
              id: 'bad_b',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'parent2', children: [{ key: 'AlsoBad' }] },
              evidence: [{ turn_tag: 'T1', quote: 'y', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'claude-sonnet-4-6',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
        allowPartial: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops).toEqual([]);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]).toMatch(/bad_a/);
      expect(result.warnings[1]).toMatch(/bad_b/);
    });

    it('default (allowPartial omitted) preserves strict fail-fast — backward compat guard', () => {
      // Existing callers (golden tests, the strict pipeline path) rely
      // on one bad item killing the whole batch. Don't quietly demote
      // them to partial mode by accident.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'good',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'good_node', values: { v: 'ok' } },
              evidence: [{ turn_tag: 'T1', quote: 'q', role: 'primary' }],
            },
            {
              id: 'bad',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'parent', children: [{ key: 'NotSnake' }] },
              evidence: [{ turn_tag: 'T1', quote: 'q', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'claude-sonnet-4-6',
        extractedAt: '2026-04-25T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('empty-define quality guard', () => {
    // Drops items that produce only bare `define` ops (no `populate`,
    // no `set`, no populated children). The failure mode that motivated
    // this guard: gpt-5.4-nano on a Sony camera comparison conversation
    // emitted seven items each with just a `key` —
    // `camera_comparison`, `a7r_v_philosophy_resolution`, etc. — and no
    // values. The compiler dutifully turned each into a bare define,
    // and the workspace got polluted with seven empty buckets that the
    // user had to clean up by hand.
    //
    // Treating this as a deterministic filter (rather than a prompt
    // issue) means small-model output can't bypass it.

    const sectionHeaderJunkDraft: ExtractionDraft = {
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'junk_1',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          candidate: { key: 'camera_comparison' }, // no values, no children, no slot
          evidence: [{ turn_tag: 'T1', quote: 'comparing the cameras', role: 'primary' }],
        },
      ],
    };

    it('drops an item whose only output is a bare define', () => {
      const result = compileExtractionDraft({
        draft: sectionHeaderJunkDraft,
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops).toEqual([]);
      expect(result.warnings.some((w) => w.includes('junk_1') && /empty define/i.test(w))).toBe(
        true
      );
    });

    it('drops empty items in strict mode too (no allowPartial needed)', () => {
      // The guard is a pipeline filter, not a per-item compile failure —
      // an empty define isn't something the model can be reasked to
      // "fix" usefully. So it must run regardless of allowPartial.
      const result = compileExtractionDraft({
        draft: sectionHeaderJunkDraft,
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
        // allowPartial omitted = strict
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops).toEqual([]);
    });

    it('keeps items that carry at least one populate (values present)', () => {
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'good',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'a7r_v', values: { sensor_resolution: '61 megapixels' } },
              evidence: [{ turn_tag: 'T1', quote: '61 megapixels', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops.some((op) => 'populate' in op)).toBe(true);
    });

    it('keeps items that set a slot (value + slot present)', () => {
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'slotted',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'a7r_v', slot: 'sensor_type', value: 'BSI CMOS' },
              evidence: [{ turn_tag: 'T1', quote: 'BSI CMOS', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops.some((op) => 'set' in op)).toBe(true);
    });

    it('drops items where every child is also bare (parent + all-empty children)', () => {
      // The deeper failure shape: parent has no values AND every child
      // also has no values. The compiled ops are still all defines.
      // Filter must catch this even with the children expansion in
      // play.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'all_empty',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: {
                key: 'comparison',
                children: [{ key: 'a7r_v' }, { key: 'a7_v' }], // no values on either
              },
              evidence: [{ turn_tag: 'T1', quote: 'comparison', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops).toEqual([]);
    });

    it('keeps populated children + parent scaffold but DROPS empty sibling children', () => {
      // P2 mixed-item regression: an item with one populated child and
      // one bare child used to keep all three defines — parent + both
      // children — because the per-item filter only checks "every op a
      // bare define". The bare child's define still rendered as an
      // empty bucket. The path-level pruner closes that gap: defines
      // whose path is neither equal to nor an ancestor of any
      // populate/set path get pruned, while scaffolding for the
      // populated child is preserved.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'mixed',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: {
                key: 'cameras',
                children: [
                  { key: 'a7r_v', values: { resolution: '61 megapixels' } },
                  { key: 'a7_v' }, // empty sibling — must be pruned
                ],
              },
              evidence: [{ turn_tag: 'T1', quote: '61 megapixels', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Populate for the populated child survives.
      expect(
        result.ops.some((op) => 'populate' in op && op.populate.path === 'cameras/a7r_v')
      ).toBe(true);
      // Parent scaffold survives (it's an ancestor of the populated path).
      expect(result.ops.some((op) => 'define' in op && op.define.path === 'cameras')).toBe(true);
      // The populated child's own define survives (path equals populate path).
      expect(result.ops.some((op) => 'define' in op && op.define.path === 'cameras/a7r_v')).toBe(
        true
      );
      // The empty sibling's define is PRUNED — this is the gap fix.
      expect(result.ops.some((op) => 'define' in op && op.define.path === 'cameras/a7_v')).toBe(
        false
      );
      // And the prune is visible in warnings naming the dropped path.
      expect(
        result.warnings.some(
          (w) => w.includes('cameras/a7_v') && /no populate or set descendant/i.test(w)
        )
      ).toBe(true);
    });

    it('preserves scaffold defines that support a populate emitted by a different item', () => {
      // Cross-item scaffolding case: item A defines `cameras` (no
      // populate of its own), item B populates `cameras/a7r_v`. The
      // per-item filter would drop item A as empty-defines-only — but
      // we run it FIRST, so item A is gone before path-pruning. Result:
      // populate at `cameras/a7r_v` without parent scaffold = apply
      // failure.
      //
      // The right shape from the model is: item B emits its own
      // `cameras` define via compileChildren's parent path. To pin that
      // contract, ensure the pruner doesn't strip parent scaffolds when
      // they ARE produced by the populating item.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'with_populate',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: {
                key: 'cameras',
                children: [{ key: 'a7r_v', values: { resolution: '61 megapixels' } }],
              },
              evidence: [{ turn_tag: 'T1', quote: '61 megapixels', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Both the parent scaffold and the populated child's own define
      // survive — the populate isn't orphaned.
      expect(result.ops.some((op) => 'define' in op && op.define.path === 'cameras')).toBe(true);
      expect(result.ops.some((op) => 'define' in op && op.define.path === 'cameras/a7r_v')).toBe(
        true
      );
      expect(
        result.ops.some((op) => 'populate' in op && op.populate.path === 'cameras/a7r_v')
      ).toBe(true);
    });

    it('drops junk items but keeps real ones in the same draft', () => {
      // The exact pattern the user hit: one good item from the prior
      // extraction (sony specs) coexists with a wave of section-header
      // junk in a follow-up extraction. The guard must be per-item, not
      // all-or-nothing.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'junk_a',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'camera_comparison' },
              evidence: [{ turn_tag: 'T1', quote: 'comparison', role: 'primary' }],
            },
            {
              id: 'real',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'a7r_v', values: { sensor_resolution: '61 megapixels' } },
              evidence: [{ turn_tag: 'T1', quote: '61 megapixels', role: 'primary' }],
            },
            {
              id: 'junk_b',
              intent: 'add',
              confidence: 0.9,
              reasoning_type: 'direct',
              candidate: { key: 'decision_rule' },
              evidence: [{ turn_tag: 'T1', quote: 'decision', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Only the real item's ops survive: define + populate for `a7r_v`.
      expect(result.ops.some((op) => 'populate' in op && op.populate.path === 'a7r_v')).toBe(true);
      expect(
        result.ops.some((op) => 'define' in op && op.define.path === 'camera_comparison')
      ).toBe(false);
      expect(result.ops.some((op) => 'define' in op && op.define.path === 'decision_rule')).toBe(
        false
      );
      expect(result.warnings.filter((w) => /empty define/i.test(w))).toHaveLength(2);
    });

    it('does not flag noop items (intent: noop emits zero ops by design)', () => {
      // `intent: noop` returns ops=[] from compileItem on purpose.
      // The guard ignores empty op lists (length===0) so noop items
      // pass through without a misleading "dropped: empty define"
      // warning.
      const result = compileExtractionDraft({
        draft: {
          schema: EXTRACTION_DRAFT_SCHEMA,
          version: 1,
          mode: 'bootstrap',
          items: [
            {
              id: 'noop',
              intent: 'noop',
              confidence: 0.5,
              reasoning_type: 'implicit',
              candidate: {},
              evidence: [{ turn_tag: 'T1', quote: 'no signal', role: 'primary' }],
            },
          ],
        },
        sourceModel: 'gpt-5.4-nano',
        extractedAt: '2026-04-26T00:00:00.000Z',
        turnHashByTag: { T1: 'sha256:turn-1' },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ops).toEqual([]);
      expect(result.warnings.some((w) => /empty define/i.test(w))).toBe(false);
    });
  });
});
