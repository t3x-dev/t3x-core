import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyYOps } from '../src';
import { canonicalJson } from '../src/canonical';
import {
  compileYOpsPathReplacement,
  compileYOpsRecipe,
  getYOpsRecipeCompiler,
  listYOpsRecipeCompilers,
  YOPS_OPS_V1_PROFILE_ID,
  YOPS_PRIMITIVE_OPERATION_NAMES,
  YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  YOPS_RECIPE_PROFILES,
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
    ]);
    expect(getYOpsRecipeCompiler(YOPS_RECIPE_REPLACE_PATH_ID)?.compile).toBe(
      compileYOpsPathReplacement
    );
    expect(getYOpsRecipeCompiler('missing')).toBeUndefined();
  });
});

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
