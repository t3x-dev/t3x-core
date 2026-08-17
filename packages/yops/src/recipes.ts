import { canonicalJson } from './canonical';
import type { YOp, YValue } from './types';

export const YOPS_V1_SPEC_DIGEST_DOMAIN = 't3x-yops-driver-spec-v1' as const;
export const YOPS_V1_SPEC_DIGEST =
  'sha256:2856688a25ab990f37019d10c0119a9967a0fb5f469c177d5f3e59ff1e508f37' as const;

export const YOPS_OPS_V1_PROFILE_ID = 'yops.ops.v1' as const;
export const YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID = 'yops.primitives.v2-candidate' as const;

export const YOPS_V1_FROZEN_OPERATION_NAMES = Object.freeze([
  'define',
  'drop',
  'rename',
  'set',
  'unset',
  'populate',
  'append',
  'move',
  'clone',
  'nest',
  'split',
  'fold',
  'merge',
  'sort',
  'unique',
  'pick',
  'omit',
  'assert',
] as const);

export const YOPS_PRIMITIVE_OPERATION_NAMES = Object.freeze(['assert', 'set', 'unset'] as const);

export type YOpsV1OperationName = (typeof YOPS_V1_FROZEN_OPERATION_NAMES)[number];
export type YOpsPrimitiveOperationName = (typeof YOPS_PRIMITIVE_OPERATION_NAMES)[number];
export type YOpsRecipeProfileId =
  | typeof YOPS_OPS_V1_PROFILE_ID
  | typeof YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID;

export interface YOpsRecipeProfile {
  readonly id: YOpsRecipeProfileId;
  readonly status: 'frozen' | 'experimental';
  readonly operationNames: readonly YOpsV1OperationName[];
  readonly specDigestDomain: typeof YOPS_V1_SPEC_DIGEST_DOMAIN;
  readonly specDigest: typeof YOPS_V1_SPEC_DIGEST;
  readonly notes: readonly string[];
}

export const YOPS_RECIPE_PROFILES = Object.freeze([
  Object.freeze({
    id: YOPS_OPS_V1_PROFILE_ID,
    status: 'frozen',
    operationNames: YOPS_V1_FROZEN_OPERATION_NAMES,
    specDigestDomain: YOPS_V1_SPEC_DIGEST_DOMAIN,
    specDigest: YOPS_V1_SPEC_DIGEST,
    notes: Object.freeze([
      'The YOps 1.x Effect surface is the frozen 18-op conformance profile.',
      'History written with this profile must remain bit-for-bit replayable.',
    ]),
  }),
  Object.freeze({
    id: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
    status: 'experimental',
    operationNames: YOPS_PRIMITIVE_OPERATION_NAMES,
    specDigestDomain: YOPS_V1_SPEC_DIGEST_DOMAIN,
    specDigest: YOPS_V1_SPEC_DIGEST,
    notes: Object.freeze([
      'The primitive profile is a compiler target, not a replacement for the v1 runtime union.',
      'Recipe invocations and expansion digests belong in proposal/request facts, outside Effect identity.',
    ]),
  }),
] as const satisfies readonly YOpsRecipeProfile[]);

export const YOPS_RECIPE_REPLACE_PATH_ID = 'yops.recipe.replace-path.v1' as const;

export interface YOpsPresentPathValue {
  readonly state: 'present';
  readonly value: YValue;
}

export interface YOpsAbsentPathValue {
  readonly state: 'absent';
}

export type YOpsPathValue = YOpsPresentPathValue | YOpsAbsentPathValue;

export interface CompileYOpsPathReplacementInput {
  readonly path: string;
  readonly base: YOpsPathValue;
  readonly target: YOpsPathValue;
}

export type YOpsRecipeId = typeof YOPS_RECIPE_REPLACE_PATH_ID;
export type YOpsRecipeInput = CompileYOpsPathReplacementInput;

export interface YOpsRecipeCompiler {
  readonly id: YOpsRecipeId;
  readonly profile: typeof YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID;
  readonly description: string;
  readonly outputOperationNames: readonly YOpsPrimitiveOperationName[];
  compile(input: YOpsRecipeInput): readonly YOp[];
}

function cloneYValue(value: YValue): YValue {
  return structuredClone(value);
}

function pathValuesEqual(left: YOpsPathValue, right: YOpsPathValue): boolean {
  if (left.state !== right.state) return false;
  if (left.state === 'absent') return true;
  return canonicalJson(left.value) === canonicalJson((right as YOpsPresentPathValue).value);
}

function assertRecipePath(path: string): void {
  if (path.trim().length === 0) {
    throw new TypeError('YOps recipe path must be a non-empty YOps path');
  }
}

export function compileYOpsPathReplacement(input: CompileYOpsPathReplacementInput): readonly YOp[] {
  assertRecipePath(input.path);
  if (pathValuesEqual(input.base, input.target)) return [];

  const ops: YOp[] = [
    input.base.state === 'present'
      ? { assert: { path: input.path, equals: cloneYValue(input.base.value) } }
      : { assert: { path: input.path, exists: false } },
  ];
  if (input.target.state === 'present') {
    ops.push({ set: { path: input.path, value: cloneYValue(input.target.value) } });
  } else {
    ops.push({ unset: { path: input.path } });
  }
  return ops;
}

const replacePathCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_REPLACE_PATH_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description:
    'Compile a base-aware path replacement into assert + set/unset primitive operations.',
  outputOperationNames: YOPS_PRIMITIVE_OPERATION_NAMES,
  compile: compileYOpsPathReplacement,
});

const YOPS_RECIPE_COMPILERS = Object.freeze({
  [YOPS_RECIPE_REPLACE_PATH_ID]: replacePathCompiler,
} as const);

export function listYOpsRecipeCompilers(): readonly YOpsRecipeCompiler[] {
  return Object.values(YOPS_RECIPE_COMPILERS);
}

export function getYOpsRecipeCompiler(id: string): YOpsRecipeCompiler | undefined {
  return YOPS_RECIPE_COMPILERS[id as YOpsRecipeId];
}

export function compileYOpsRecipe(id: YOpsRecipeId, input: YOpsRecipeInput): readonly YOp[] {
  return YOPS_RECIPE_COMPILERS[id].compile(input);
}
