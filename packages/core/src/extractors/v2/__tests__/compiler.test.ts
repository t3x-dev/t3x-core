import { describe, expect, it } from 'vitest';
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

  describe('normalizePath', () => {
    it('converts dotted LLM paths into slashed YOps paths', () => {
      // Regression: small models (gpt-5.4-nano, etc.) emit dotted paths.
      // Without normalization the engine treated `characters.main_protagonist`
      // as a single root node whose entire key is the literal string with
      // dots, producing a flat tree that didn't match the user's mental
      // model. After this fix the paths are real nested paths.
      expect(normalizePath('characters.main_protagonist')).toBe('characters/main_protagonist');
      expect(normalizePath('story.overview.major_conflicts')).toBe(
        'story/overview/major_conflicts'
      );
    });

    it('handles mixed dot/slash separators consistently', () => {
      expect(normalizePath('story.overview/value')).toBe('story/overview/value');
      expect(normalizePath('story.overview.soul_reaper/value')).toBe(
        'story/overview/soul_reaper/value'
      );
    });

    it('passes through already-correct slashed paths', () => {
      expect(normalizePath('mont_saint_michel/location/test1')).toBe(
        'mont_saint_michel/location/test1'
      );
      expect(normalizePath('airport_issue')).toBe('airport_issue');
    });

    it('strips leading/trailing slashes and collapses runs', () => {
      expect(normalizePath('/airport_issue/')).toBe('airport_issue');
      expect(normalizePath('story//overview')).toBe('story/overview');
    });

    it('rejects segments that violate SNAKE_CASE_KEY', () => {
      // Uppercase, leading digit, kebab-case all fail. The compiler treats
      // null as a hard signal to fall back to the next path source or
      // synthesise — never to ship the bad string forward.
      expect(normalizePath('Camel.Case.Path')).toBeNull();
      expect(normalizePath('1starts_with_digit')).toBeNull();
      expect(normalizePath('kebab-case-key')).toBeNull();
      expect(normalizePath('UPPER')).toBeNull();
    });

    it('returns null for empty / null / whitespace-only input', () => {
      expect(normalizePath(null)).toBeNull();
      expect(normalizePath(undefined)).toBeNull();
      expect(normalizePath('')).toBeNull();
      expect(normalizePath('   ')).toBeNull();
      expect(normalizePath('//')).toBeNull();
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

    it('emits only define when a child has no values', () => {
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
      expect(result.ops).toHaveLength(2);
      expect((result.ops[0] as { define: { path: string } }).define.path).toBe('parent');
      expect((result.ops[1] as { define: { path: string } }).define.path).toBe(
        'parent/empty_child'
      );
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
});
