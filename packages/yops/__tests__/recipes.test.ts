import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src';
import { canonicalJson } from '../src/canonical';
import {
  canonicalYOpsRecipeExpansion,
  canonicalYOpsRecipeInvocation,
  compileYOpsMappingKeyOmit,
  compileYOpsMappingKeyPick,
  compileYOpsMappingKeyRename,
  compileYOpsPathClone,
  compileYOpsPathMove,
  compileYOpsPathReplacement,
  compileYOpsRecipe,
  compileYOpsRecipeInvocation,
  compileYOpsRecipeInvocations,
  compileYOpsSequenceAppend,
  createYOpsRecipeInvocation,
  getYOpsRecipeCompiler,
  listYOpsRecipeCompilers,
  YOPS_OPS_V1_PROFILE_ID,
  YOPS_PRIMITIVE_OPERATION_NAMES,
  YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID,
  YOPS_RECIPE_CLONE_PATH_ID,
  YOPS_RECIPE_EXPANSION_SCHEMA,
  YOPS_RECIPE_INVOCATION_SCHEMA,
  YOPS_RECIPE_MOVE_PATH_ID,
  YOPS_RECIPE_OMIT_MAPPING_KEYS_ID,
  YOPS_RECIPE_PICK_MAPPING_KEYS_ID,
  YOPS_RECIPE_PROFILES,
  YOPS_RECIPE_RENAME_MAPPING_KEY_ID,
  YOPS_RECIPE_REPLACE_PATH_ID,
  YOPS_V1_FROZEN_OPERATION_NAMES,
  YOPS_V1_SPEC_DIGEST,
  YOPS_V1_SPEC_DIGEST_DOMAIN,
} from '../src/recipes';
import { parseSpec } from '../src/spec';
import type { YOp, YValue } from '../src/types';

const yamlStr = readFileSync(join(__dirname, '..', 'yops.yaml'), 'utf8');
const parsedSpec = parseSpec(yamlStr);

function digestSpec(): string {
  const hex = createHash('sha256')
    .update(`${YOPS_V1_SPEC_DIGEST_DOMAIN}\0`, 'utf8')
    .update(canonicalJson(parsedSpec as unknown as YValue), 'utf8')
    .digest('hex');
  return `sha256:${hex}`;
}

describe('YOps recipe compiler profiles', () => {
  it('pins the frozen v1 operation profile to the current native spec digest', () => {
    expect(YOPS_V1_SPEC_DIGEST).toBe(digestSpec());
    expect(YOPS_V1_FROZEN_OPERATION_NAMES).toEqual(Object.keys(parsedSpec.operations));
    expect(YOPS_V1_FROZEN_OPERATION_NAMES).toHaveLength(18);
  });

  it('declares the primitive candidate as a subset and keeps v1 intact', () => {
    const v1 = YOPS_RECIPE_PROFILES.find((profile) => profile.id === YOPS_OPS_V1_PROFILE_ID);
    const primitive = YOPS_RECIPE_PROFILES.find(
      (profile) => profile.id === YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID
    );

    expect(v1).toMatchObject({
      status: 'frozen',
      operationNames: YOPS_V1_FROZEN_OPERATION_NAMES,
      specDigest: YOPS_V1_SPEC_DIGEST,
    });
    expect(primitive).toMatchObject({
      status: 'experimental',
      operationNames: YOPS_PRIMITIVE_OPERATION_NAMES,
      specDigest: YOPS_V1_SPEC_DIGEST,
    });
    expect(YOPS_PRIMITIVE_OPERATION_NAMES).toEqual(['assert', 'set', 'unset']);
    expect(YOPS_PRIMITIVE_OPERATION_NAMES.every((op) => parsedSpec.operations[op])).toBe(true);
  });

  it('exposes versioned recipe compilers through a small registry', () => {
    expect(listYOpsRecipeCompilers()).toEqual([
      expect.objectContaining({
        id: YOPS_RECIPE_REPLACE_PATH_ID,
        profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
        outputOperationNames: YOPS_PRIMITIVE_OPERATION_NAMES,
      }),
      expect.objectContaining({
        id: YOPS_RECIPE_CLONE_PATH_ID,
        profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
        outputOperationNames: ['assert', 'set'],
      }),
      expect.objectContaining({
        id: YOPS_RECIPE_MOVE_PATH_ID,
        profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
        outputOperationNames: YOPS_PRIMITIVE_OPERATION_NAMES,
      }),
      expect.objectContaining({
        id: YOPS_RECIPE_RENAME_MAPPING_KEY_ID,
        profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
        outputOperationNames: ['assert', 'set'],
      }),
      expect.objectContaining({
        id: YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID,
        profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
        outputOperationNames: ['assert', 'set'],
      }),
      expect.objectContaining({
        id: YOPS_RECIPE_PICK_MAPPING_KEYS_ID,
        profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
        outputOperationNames: ['assert', 'set'],
      }),
      expect.objectContaining({
        id: YOPS_RECIPE_OMIT_MAPPING_KEYS_ID,
        profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
        outputOperationNames: ['assert', 'set'],
      }),
    ]);
    expect(getYOpsRecipeCompiler(YOPS_RECIPE_REPLACE_PATH_ID)?.compile).toBe(
      compileYOpsPathReplacement
    );
    expect(getYOpsRecipeCompiler(YOPS_RECIPE_CLONE_PATH_ID)?.id).toBe(YOPS_RECIPE_CLONE_PATH_ID);
    expect(getYOpsRecipeCompiler(YOPS_RECIPE_MOVE_PATH_ID)?.id).toBe(YOPS_RECIPE_MOVE_PATH_ID);
    expect(getYOpsRecipeCompiler(YOPS_RECIPE_RENAME_MAPPING_KEY_ID)?.id).toBe(
      YOPS_RECIPE_RENAME_MAPPING_KEY_ID
    );
    expect(getYOpsRecipeCompiler(YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID)?.id).toBe(
      YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID
    );
    expect(getYOpsRecipeCompiler(YOPS_RECIPE_PICK_MAPPING_KEYS_ID)?.id).toBe(
      YOPS_RECIPE_PICK_MAPPING_KEYS_ID
    );
    expect(getYOpsRecipeCompiler(YOPS_RECIPE_OMIT_MAPPING_KEYS_ID)?.id).toBe(
      YOPS_RECIPE_OMIT_MAPPING_KEYS_ID
    );
    expect(getYOpsRecipeCompiler('missing')).toBeUndefined();
  });

  it('keeps downshifted native semantics replay-equivalent while emitting only primitives', () => {
    const cases: Array<{
      name: string;
      base: YValue;
      nativeOps: readonly YOp[];
      invocation: ReturnType<typeof createYOpsRecipeInvocation>;
    }> = [
      {
        name: 'clone',
        base: { defaults: { service: { port: 8080 } }, services: {} },
        nativeOps: [{ clone: { from: 'defaults/service', to: 'services/api' } }],
        invocation: createYOpsRecipeInvocation(YOPS_RECIPE_CLONE_PATH_ID, {
          from: 'defaults/service',
          to: 'services/api',
          source: { state: 'present', value: { port: 8080 } },
          destination: { state: 'absent' },
        }),
      },
      {
        name: 'move',
        base: { draft: { summary: 'Ready', owner: 'agent' }, review: {} },
        nativeOps: [{ move: { from: 'draft/summary', to: 'review/summary' } }],
        invocation: createYOpsRecipeInvocation(YOPS_RECIPE_MOVE_PATH_ID, {
          from: 'draft/summary',
          to: 'review/summary',
          source: { state: 'present', value: 'Ready' },
          destination: { state: 'absent' },
        }),
      },
      {
        name: 'rename',
        base: { metadata: { title: 'Draft', slug: 'draft' } },
        nativeOps: [{ rename: { path: 'metadata/slug', to: 'canonical_slug' } }],
        invocation: createYOpsRecipeInvocation(YOPS_RECIPE_RENAME_MAPPING_KEY_ID, {
          path: 'metadata',
          base: { state: 'present', value: { title: 'Draft', slug: 'draft' } },
          from: 'slug',
          to: 'canonical_slug',
        }),
      },
      {
        name: 'append',
        base: { tasks: ['draft'] },
        nativeOps: [{ append: { path: 'tasks', value: 'review' } }],
        invocation: createYOpsRecipeInvocation(YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID, {
          path: 'tasks',
          base: { state: 'present', value: ['draft'] },
          value: 'review',
        }),
      },
      {
        name: 'pick',
        base: { metadata: { title: 'Draft', owner: 'review', draft_only: true } },
        nativeOps: [{ pick: { path: 'metadata', keys: ['title', 'owner'] } }],
        invocation: createYOpsRecipeInvocation(YOPS_RECIPE_PICK_MAPPING_KEYS_ID, {
          path: 'metadata',
          base: { state: 'present', value: { title: 'Draft', owner: 'review', draft_only: true } },
          keys: ['title', 'owner'],
        }),
      },
      {
        name: 'omit',
        base: { metadata: { title: 'Draft', owner: 'review', draft_only: true } },
        nativeOps: [{ omit: { path: 'metadata', keys: ['draft_only'] } }],
        invocation: createYOpsRecipeInvocation(YOPS_RECIPE_OMIT_MAPPING_KEYS_ID, {
          path: 'metadata',
          base: { state: 'present', value: { title: 'Draft', owner: 'review', draft_only: true } },
          keys: ['draft_only'],
        }),
      },
    ];

    for (const testCase of cases) {
      const recipe = compileYOpsRecipeInvocation(testCase.invocation);
      const recipeOperationNames = recipe.operations.map(recipeOperationName);
      const nativeResult = applyYOps(testCase.base, testCase.nativeOps as YOp[]);
      const recipeResult = applyYOps(testCase.base, recipe.operations as YOp[]);

      expect(
        recipeOperationNames.every((name) => YOPS_PRIMITIVE_OPERATION_NAMES.includes(name))
      ).toBe(true);
      expect(recipe.expansion.profile).toBe(YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID);
      expect(recipeResult, testCase.name).toMatchObject({ ok: true });
      expect(recipeResult).toMatchObject({ doc: nativeResult.doc });
    }
  });
});

function recipeOperationName(op: YOp): (typeof YOPS_PRIMITIVE_OPERATION_NAMES)[number] {
  if ('assert' in op) return 'assert';
  if ('set' in op) return 'set';
  if ('unset' in op) return 'unset';
  throw new Error(`Recipe emitted a non-primitive operation: ${JSON.stringify(op)}`);
}

describe('compileYOpsPathReplacement', () => {
  it('compiles present-to-present replacement into assert + set primitives', () => {
    const ops = compileYOpsRecipe(YOPS_RECIPE_REPLACE_PATH_ID, {
      path: 'config/host',
      base: { state: 'present', value: 'old' },
      target: { state: 'present', value: 'new' },
    });

    expect(ops).toEqual([
      { assert: { path: 'config/host', equals: 'old' } },
      { set: { path: 'config/host', value: 'new' } },
    ]);
    expect(applyYOps({ config: { host: 'old' } }, ops as YOp[])).toMatchObject({
      ok: true,
      doc: { config: { host: 'new' } },
    });
  });

  it('compiles absent-to-present creation with an explicit absence assertion', () => {
    const ops = compileYOpsPathReplacement({
      path: 'config/port',
      base: { state: 'absent' },
      target: { state: 'present', value: 5432 },
    });

    expect(ops).toEqual([
      { assert: { path: 'config/port', exists: false } },
      { set: { path: 'config/port', value: 5432 } },
    ]);
    expect(applyYOps({ config: {} }, ops as YOp[])).toMatchObject({
      ok: true,
      doc: { config: { port: 5432 } },
    });
  });

  it('compiles present-to-absent removal with an equality assertion', () => {
    const ops = compileYOpsPathReplacement({
      path: 'config/password',
      base: { state: 'present', value: 'secret' },
      target: { state: 'absent' },
    });

    expect(ops).toEqual([
      { assert: { path: 'config/password', equals: 'secret' } },
      { unset: { path: 'config/password' } },
    ]);
    expect(applyYOps({ config: { password: 'secret', host: 'db' } }, ops as YOp[])).toMatchObject({
      ok: true,
      doc: { config: { host: 'db' } },
    });
  });

  it('returns no operations when the base and target path states match', () => {
    expect(
      compileYOpsPathReplacement({
        path: 'config',
        base: { state: 'present', value: { b: 2, a: 1 } },
        target: { state: 'present', value: { a: 1, b: 2 } },
      })
    ).toEqual([]);
    expect(
      compileYOpsPathReplacement({
        path: 'config/missing',
        base: { state: 'absent' },
        target: { state: 'absent' },
      })
    ).toEqual([]);
  });

  it('fails closed on stale base instead of applying a recipe to the wrong document', () => {
    const ops = compileYOpsPathReplacement({
      path: 'config/host',
      base: { state: 'present', value: 'old' },
      target: { state: 'present', value: 'new' },
    });

    expect(applyYOps({ config: { host: 'drifted' } }, ops as YOp[])).toMatchObject({
      ok: false,
      doc: { config: { host: 'drifted' } },
      applied: 0,
      error: expect.objectContaining({ code: 'ASSERTION_FAILED' }),
    });
  });

  it('returns fresh operation values so caller mutation cannot rewrite later compiles', () => {
    const first = compileYOpsPathReplacement({
      path: 'config',
      base: { state: 'present', value: { enabled: false } },
      target: { state: 'present', value: { enabled: true } },
    }) as YOp[];
    const firstSet = first[1] as { set: { path: string; value: { enabled: boolean } } };
    firstSet.set.value.enabled = false;

    expect(
      compileYOpsPathReplacement({
        path: 'config',
        base: { state: 'present', value: { enabled: false } },
        target: { state: 'present', value: { enabled: true } },
      })
    ).toEqual([
      { assert: { path: 'config', equals: { enabled: false } } },
      { set: { path: 'config', value: { enabled: true } } },
    ]);
  });

  it('rejects empty recipe paths before producing operations', () => {
    expect(() =>
      compileYOpsPathReplacement({
        path: '',
        base: { state: 'absent' },
        target: { state: 'present', value: true },
      })
    ).toThrow('YOps recipe path must be a non-empty YOps path');
  });
});

describe('compileYOpsPathClone', () => {
  it('compiles clone-path into source/destination assertions plus set', () => {
    const ops = compileYOpsRecipe(YOPS_RECIPE_CLONE_PATH_ID, {
      from: 'defaults/service',
      to: 'services/api',
      source: { state: 'present', value: { port: 8080, enabled: true } },
      destination: { state: 'absent' },
    });

    expect(ops).toEqual([
      { assert: { path: 'defaults/service', equals: { port: 8080, enabled: true } } },
      { assert: { path: 'services/api', exists: false } },
      { set: { path: 'services/api', value: { port: 8080, enabled: true } } },
    ]);
    expect(
      applyYOps(
        {
          defaults: { service: { port: 8080, enabled: true } },
          services: {},
        },
        ops as YOp[]
      )
    ).toMatchObject({
      ok: true,
      doc: {
        defaults: { service: { port: 8080, enabled: true } },
        services: { api: { port: 8080, enabled: true } },
      },
    });
  });

  it('fails closed when clone destination is already present or source drifts', () => {
    const ops = compileYOpsPathClone({
      from: 'defaults/service',
      to: 'services/api',
      source: { state: 'present', value: { port: 8080 } },
      destination: { state: 'absent' },
    });

    expect(
      applyYOps(
        {
          defaults: { service: { port: 8080 } },
          services: { api: { port: 3000 } },
        },
        ops as YOp[]
      )
    ).toMatchObject({
      ok: false,
      applied: 1,
      error: expect.objectContaining({ code: 'ASSERTION_FAILED' }),
    });
    expect(
      applyYOps(
        {
          defaults: { service: { port: 3000 } },
          services: {},
        },
        ops as YOp[]
      )
    ).toMatchObject({
      ok: false,
      applied: 0,
      error: expect.objectContaining({ code: 'ASSERTION_FAILED' }),
    });
  });
});

describe('compileYOpsPathMove', () => {
  it('compiles move-path into assert + set + unset primitives', () => {
    const ops = compileYOpsPathMove({
      from: 'draft/summary',
      to: 'review/summary',
      source: { state: 'present', value: 'Ready for review' },
      destination: { state: 'absent' },
    });

    expect(ops).toEqual([
      { assert: { path: 'draft/summary', equals: 'Ready for review' } },
      { assert: { path: 'review/summary', exists: false } },
      { set: { path: 'review/summary', value: 'Ready for review' } },
      { unset: { path: 'draft/summary' } },
    ]);
    expect(
      applyYOps(
        {
          draft: { summary: 'Ready for review', owner: 'agent' },
          review: {},
        },
        ops as YOp[]
      )
    ).toMatchObject({
      ok: true,
      doc: {
        draft: { owner: 'agent' },
        review: { summary: 'Ready for review' },
      },
    });
  });

  it('rejects same-path moves and moves into the source subtree', () => {
    expect(() =>
      compileYOpsPathMove({
        from: 'draft',
        to: 'draft',
        source: { state: 'present', value: { summary: 'same' } },
        destination: { state: 'absent' },
      })
    ).toThrow('source and destination paths must be different');
    expect(() =>
      compileYOpsPathMove({
        from: 'draft',
        to: 'draft/archive',
        source: { state: 'present', value: { summary: 'nested' } },
        destination: { state: 'absent' },
      })
    ).toThrow('destination must not be inside the source subtree');
  });
});

describe('compileYOpsMappingKeyRename', () => {
  it('compiles a mapping-key rename into assert + set primitives', () => {
    const ops = compileYOpsRecipe(YOPS_RECIPE_RENAME_MAPPING_KEY_ID, {
      path: 'metadata',
      base: { state: 'present', value: { title: 'Draft', slug: 'draft', locked: false } },
      from: 'slug',
      to: 'canonical_slug',
    });

    expect(ops).toEqual([
      {
        assert: {
          path: 'metadata',
          equals: { title: 'Draft', slug: 'draft', locked: false },
        },
      },
      {
        set: {
          path: 'metadata',
          value: { title: 'Draft', canonical_slug: 'draft', locked: false },
        },
      },
    ]);
    expect(
      applyYOps({ metadata: { title: 'Draft', slug: 'draft', locked: false } }, ops as YOp[])
    ).toMatchObject({
      ok: true,
      doc: { metadata: { title: 'Draft', canonical_slug: 'draft', locked: false } },
    });
  });

  it('fails closed when rename preconditions do not match the mapping shape', () => {
    expect(() =>
      compileYOpsMappingKeyRename({
        path: 'metadata',
        base: { state: 'present', value: ['not', 'mapping'] },
        from: 'slug',
        to: 'canonical_slug',
      })
    ).toThrow('base must be a mapping value');
    expect(() =>
      compileYOpsMappingKeyRename({
        path: 'metadata',
        base: { state: 'present', value: { title: 'Draft' } },
        from: 'slug',
        to: 'canonical_slug',
      })
    ).toThrow('Cannot rename missing key: slug');
    expect(() =>
      compileYOpsMappingKeyRename({
        path: 'metadata',
        base: { state: 'present', value: { slug: 'draft', canonical_slug: 'used' } },
        from: 'slug',
        to: 'canonical_slug',
      })
    ).toThrow('Cannot rename slug to existing key: canonical_slug');
  });

  it('returns no operations when a rename maps a key to itself', () => {
    expect(
      compileYOpsMappingKeyRename({
        path: 'metadata',
        base: { state: 'present', value: { slug: 'draft' } },
        from: 'slug',
        to: 'slug',
      })
    ).toEqual([]);
  });
});

describe('compileYOpsMappingKeyPick', () => {
  it('compiles key selection into assert + set primitives', () => {
    const ops = compileYOpsMappingKeyPick({
      path: 'metadata',
      base: { state: 'present', value: { title: 'Draft', owner: 'review', draft_only: true } },
      keys: ['title', 'owner'],
    });

    expect(ops).toEqual([
      {
        assert: {
          path: 'metadata',
          equals: { title: 'Draft', owner: 'review', draft_only: true },
        },
      },
      { set: { path: 'metadata', value: { title: 'Draft', owner: 'review' } } },
    ]);
    expect(
      applyYOps({ metadata: { title: 'Draft', owner: 'review', draft_only: true } }, ops as YOp[])
    ).toMatchObject({
      ok: true,
      doc: { metadata: { title: 'Draft', owner: 'review' } },
    });
  });

  it('rejects duplicate or missing picked keys before producing operations', () => {
    expect(() =>
      compileYOpsMappingKeyPick({
        path: 'metadata',
        base: { state: 'present', value: { title: 'Draft' } },
        keys: ['title', 'title'],
      })
    ).toThrow('Duplicate picked key: title');
    expect(() =>
      compileYOpsMappingKeyPick({
        path: 'metadata',
        base: { state: 'present', value: { title: 'Draft' } },
        keys: ['owner'],
      })
    ).toThrow('Cannot pick missing key: owner');
  });

  it('returns no operations when picking preserves the full canonical mapping', () => {
    expect(
      compileYOpsMappingKeyPick({
        path: 'metadata',
        base: { state: 'present', value: { owner: 'review', title: 'Draft' } },
        keys: ['title', 'owner'],
      })
    ).toEqual([]);
  });
});

describe('compileYOpsSequenceAppend', () => {
  it('compiles a sequence append into assert + set primitives', () => {
    const ops = compileYOpsSequenceAppend({
      path: 'tasks',
      base: { state: 'present', value: ['draft', { id: 2, title: 'review' }] },
      value: { id: 3, title: 'commit' },
    });

    expect(ops).toEqual([
      { assert: { path: 'tasks', equals: ['draft', { id: 2, title: 'review' }] } },
      {
        set: {
          path: 'tasks',
          value: ['draft', { id: 2, title: 'review' }, { id: 3, title: 'commit' }],
        },
      },
    ]);
    expect(applyYOps({ tasks: ['draft', { id: 2, title: 'review' }] }, ops as YOp[])).toMatchObject(
      {
        ok: true,
        doc: { tasks: ['draft', { id: 2, title: 'review' }, { id: 3, title: 'commit' }] },
      }
    );
  });

  it('fails closed on stale sequence bases and rejects non-sequence bases', () => {
    const ops = compileYOpsSequenceAppend({
      path: 'tasks',
      base: { state: 'present', value: ['draft'] },
      value: 'commit',
    });

    expect(applyYOps({ tasks: ['changed'] }, ops as YOp[])).toMatchObject({
      ok: false,
      applied: 0,
      error: expect.objectContaining({ code: 'ASSERTION_FAILED' }),
    });
    expect(() =>
      compileYOpsSequenceAppend({
        path: 'tasks',
        base: { state: 'present', value: { not: 'sequence' } },
        value: 'commit',
      })
    ).toThrow('base must be a sequence value');
  });
});

describe('compileYOpsMappingKeyOmit', () => {
  it('compiles key omission into assert + set primitives', () => {
    const ops = compileYOpsMappingKeyOmit({
      path: 'metadata',
      base: {
        state: 'present',
        value: { title: 'Draft', draft_only: true, temporary: 'yes', owner: 'review' },
      },
      keys: ['draft_only', 'temporary'],
    });

    expect(ops).toEqual([
      {
        assert: {
          path: 'metadata',
          equals: { title: 'Draft', draft_only: true, temporary: 'yes', owner: 'review' },
        },
      },
      { set: { path: 'metadata', value: { title: 'Draft', owner: 'review' } } },
    ]);
    expect(
      applyYOps(
        { metadata: { title: 'Draft', draft_only: true, temporary: 'yes', owner: 'review' } },
        ops as YOp[]
      )
    ).toMatchObject({
      ok: true,
      doc: { metadata: { title: 'Draft', owner: 'review' } },
    });
  });

  it('rejects duplicate or missing omitted keys before producing operations', () => {
    expect(() =>
      compileYOpsMappingKeyOmit({
        path: 'metadata',
        base: { state: 'present', value: { draft_only: true } },
        keys: ['draft_only', 'draft_only'],
      })
    ).toThrow('Duplicate omitted key: draft_only');
    expect(() =>
      compileYOpsMappingKeyOmit({
        path: 'metadata',
        base: { state: 'present', value: { title: 'Draft' } },
        keys: ['draft_only'],
      })
    ).toThrow('Cannot omit missing key: draft_only');
  });

  it('returns no operations for an empty omit list', () => {
    expect(
      compileYOpsMappingKeyOmit({
        path: 'metadata',
        base: { state: 'present', value: { title: 'Draft' } },
        keys: [],
      })
    ).toEqual([]);
  });
});

describe('YOps recipe invocation envelopes', () => {
  it('creates canonical invocation facts without putting recipes in Effect identity', () => {
    const invocation = createYOpsRecipeInvocation(
      YOPS_RECIPE_REPLACE_PATH_ID,
      {
        path: 'config/host',
        base: { state: 'present', value: 'old' },
        target: { state: 'present', value: 'new' },
      },
      { why: 'Promote reviewed host change.' }
    );
    const reordered = createYOpsRecipeInvocation(
      YOPS_RECIPE_REPLACE_PATH_ID,
      {
        target: { value: 'new', state: 'present' },
        base: { value: 'old', state: 'present' },
        path: 'config/host',
      },
      { why: 'Promote reviewed host change.' }
    );

    expect(invocation).toEqual({
      schema: YOPS_RECIPE_INVOCATION_SCHEMA,
      recipeId: YOPS_RECIPE_REPLACE_PATH_ID,
      profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
      input: {
        path: 'config/host',
        base: { state: 'present', value: 'old' },
        target: { state: 'present', value: 'new' },
      },
      why: 'Promote reviewed host change.',
    });
    expect(canonicalYOpsRecipeInvocation(invocation)).toBe(
      canonicalYOpsRecipeInvocation(reordered)
    );
  });

  it('compiles one invocation to a canonical expansion envelope and primitive operations', () => {
    const result = compileYOpsRecipeInvocation(
      createYOpsRecipeInvocation(YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID, {
        path: 'tasks',
        base: { state: 'present', value: ['draft'] },
        value: 'review',
      })
    );

    expect(result.invocationCanonicalJson).toContain(YOPS_RECIPE_INVOCATION_SCHEMA);
    expect(result.expansion).toEqual({
      schema: YOPS_RECIPE_EXPANSION_SCHEMA,
      recipeId: YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID,
      profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
      outputOperationNames: ['assert', 'set'],
      operationCount: 2,
      operations: [
        { assert: { path: 'tasks', equals: ['draft'] } },
        { set: { path: 'tasks', value: ['draft', 'review'] } },
      ],
    });
    expect(canonicalYOpsRecipeExpansion(result.expansion)).toBe(result.expansionCanonicalJson);
    expect(applyYOps({ tasks: ['draft'] }, result.operations as YOp[])).toMatchObject({
      ok: true,
      doc: { tasks: ['draft', 'review'] },
    });
  });

  it('compiles multiple invocations into a flat primitive op list', () => {
    const result = compileYOpsRecipeInvocations([
      createYOpsRecipeInvocation(YOPS_RECIPE_RENAME_MAPPING_KEY_ID, {
        path: 'metadata',
        base: { state: 'present', value: { slug: 'draft', owner: 'review' } },
        from: 'slug',
        to: 'canonical_slug',
      }),
      createYOpsRecipeInvocation(YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID, {
        path: 'tasks',
        base: { state: 'present', value: ['draft'] },
        value: 'review',
      }),
    ]);

    expect(result.expansions).toHaveLength(2);
    expect(result.operations).toHaveLength(4);
    expect(
      applyYOps(
        {
          metadata: { slug: 'draft', owner: 'review' },
          tasks: ['draft'],
        },
        result.operations as YOp[]
      )
    ).toMatchObject({
      ok: true,
      doc: {
        metadata: { canonical_slug: 'draft', owner: 'review' },
        tasks: ['draft', 'review'],
      },
    });
  });

  it('returns defensive copies so callers cannot mutate stored invocation or expansion facts', () => {
    const invocation = createYOpsRecipeInvocation(YOPS_RECIPE_REPLACE_PATH_ID, {
      path: 'config',
      base: { state: 'present', value: { enabled: false } },
      target: { state: 'present', value: { enabled: true } },
    });
    const mutableInput = invocation.input as {
      target: { state: 'present'; value: { enabled: boolean } };
    };
    mutableInput.target.value.enabled = false;

    const compiled = compileYOpsRecipeInvocation(
      createYOpsRecipeInvocation(YOPS_RECIPE_REPLACE_PATH_ID, {
        path: 'config',
        base: { state: 'present', value: { enabled: false } },
        target: { state: 'present', value: { enabled: true } },
      })
    );
    const mutableOperation = compiled.operations[1] as {
      set: { value: { enabled: boolean } };
    };
    mutableOperation.set.value.enabled = false;

    expect(
      compileYOpsRecipeInvocation(
        createYOpsRecipeInvocation(YOPS_RECIPE_REPLACE_PATH_ID, {
          path: 'config',
          base: { state: 'present', value: { enabled: false } },
          target: { state: 'present', value: { enabled: true } },
        })
      ).operations
    ).toEqual([
      { assert: { path: 'config', equals: { enabled: false } } },
      { set: { path: 'config', value: { enabled: true } } },
    ]);
  });

  it('rejects invalid invocation schema, profile, and rationale before expansion', () => {
    expect(() =>
      createYOpsRecipeInvocation(
        YOPS_RECIPE_REPLACE_PATH_ID,
        {
          path: 'config',
          base: { state: 'absent' },
          target: { state: 'present', value: true },
        },
        { why: ' ' }
      )
    ).toThrow('why must be a non-empty string');
    expect(() =>
      compileYOpsRecipeInvocation({
        schema: 't3x.dev/yops-recipe-invocation/v0',
        recipeId: YOPS_RECIPE_REPLACE_PATH_ID,
        profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
        input: {
          path: 'config',
          base: { state: 'absent' },
          target: { state: 'present', value: true },
        },
      } as never)
    ).toThrow('Unsupported YOps recipe invocation schema');
    expect(() =>
      compileYOpsRecipeInvocation({
        schema: YOPS_RECIPE_INVOCATION_SCHEMA,
        recipeId: YOPS_RECIPE_REPLACE_PATH_ID,
        profile: YOPS_OPS_V1_PROFILE_ID,
        input: {
          path: 'config',
          base: { state: 'absent' },
          target: { state: 'present', value: true },
        },
      } as never)
    ).toThrow('requires profile yops.primitives.v2-candidate');
  });
});
