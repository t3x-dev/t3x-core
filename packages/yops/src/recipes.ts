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
const YOPS_ASSERT_SET_OPERATION_NAMES = Object.freeze(['assert', 'set'] as const);

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
export const YOPS_RECIPE_CLONE_PATH_ID = 'yops.recipe.clone-path.v1' as const;
export const YOPS_RECIPE_MOVE_PATH_ID = 'yops.recipe.move-path.v1' as const;
export const YOPS_RECIPE_RENAME_MAPPING_KEY_ID = 'yops.recipe.rename-mapping-key.v1' as const;
export const YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID = 'yops.recipe.append-sequence-item.v1' as const;
export const YOPS_RECIPE_PICK_MAPPING_KEYS_ID = 'yops.recipe.pick-mapping-keys.v1' as const;
export const YOPS_RECIPE_OMIT_MAPPING_KEYS_ID = 'yops.recipe.omit-mapping-keys.v1' as const;
export const YOPS_RECIPE_INVOCATION_SCHEMA = 't3x.dev/yops-recipe-invocation/v1' as const;
export const YOPS_RECIPE_EXPANSION_SCHEMA = 't3x.dev/yops-recipe-expansion/v1' as const;

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

export interface CompileYOpsPathCloneInput {
  readonly from: string;
  readonly to: string;
  readonly source: YOpsPresentPathValue;
  readonly destination: YOpsAbsentPathValue;
}

export interface CompileYOpsPathMoveInput extends CompileYOpsPathCloneInput {}

export interface CompileYOpsMappingKeyRenameInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly from: string;
  readonly to: string;
}

export interface CompileYOpsSequenceAppendInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly value: YValue;
}

export interface CompileYOpsMappingKeyOmitInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly keys: readonly string[];
}

export interface CompileYOpsMappingKeyPickInput extends CompileYOpsMappingKeyOmitInput {}

export type YOpsRecipeId =
  | typeof YOPS_RECIPE_REPLACE_PATH_ID
  | typeof YOPS_RECIPE_CLONE_PATH_ID
  | typeof YOPS_RECIPE_MOVE_PATH_ID
  | typeof YOPS_RECIPE_RENAME_MAPPING_KEY_ID
  | typeof YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID
  | typeof YOPS_RECIPE_PICK_MAPPING_KEYS_ID
  | typeof YOPS_RECIPE_OMIT_MAPPING_KEYS_ID;
export type YOpsRecipeInput =
  | CompileYOpsPathReplacementInput
  | CompileYOpsPathCloneInput
  | CompileYOpsPathMoveInput
  | CompileYOpsMappingKeyRenameInput
  | CompileYOpsSequenceAppendInput
  | CompileYOpsMappingKeyOmitInput
  | CompileYOpsMappingKeyPickInput;

export interface YOpsRecipeCompiler {
  readonly id: YOpsRecipeId;
  readonly profile: typeof YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID;
  readonly description: string;
  readonly outputOperationNames: readonly YOpsPrimitiveOperationName[];
  compile(input: YOpsRecipeInput): readonly YOp[];
}

export interface YOpsRecipeInvocation {
  readonly schema: typeof YOPS_RECIPE_INVOCATION_SCHEMA;
  readonly recipeId: YOpsRecipeId;
  readonly profile: typeof YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID;
  readonly input: YOpsRecipeInput;
  readonly why?: string;
}

export interface YOpsRecipeExpansion {
  readonly schema: typeof YOPS_RECIPE_EXPANSION_SCHEMA;
  readonly recipeId: YOpsRecipeId;
  readonly profile: typeof YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID;
  readonly outputOperationNames: readonly YOpsPrimitiveOperationName[];
  readonly operationCount: number;
  readonly operations: readonly YOp[];
}

export interface CompileYOpsRecipeInvocationResult {
  readonly invocation: YOpsRecipeInvocation;
  readonly invocationCanonicalJson: string;
  readonly expansion: YOpsRecipeExpansion;
  readonly expansionCanonicalJson: string;
  readonly operations: readonly YOp[];
}

export interface CompileYOpsRecipeInvocationsResult {
  readonly expansions: readonly CompileYOpsRecipeInvocationResult[];
  readonly operations: readonly YOp[];
}

function cloneYValue(value: YValue): YValue {
  return structuredClone(value);
}

function cloneYOp(op: YOp): YOp {
  return structuredClone(op);
}

function cloneRecipeInput(input: YOpsRecipeInput): YOpsRecipeInput {
  return structuredClone(input);
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

function assertDistinctRecipePaths(from: string, to: string): void {
  assertRecipePath(from);
  assertRecipePath(to);
  if (from === to) {
    throw new TypeError('YOps recipe source and destination paths must be different');
  }
}

function assertMoveDestinationIsOutsideSource(from: string, to: string): void {
  if (to.startsWith(`${from}/`)) {
    throw new TypeError('YOps move recipe destination must not be inside the source subtree');
  }
}

function assertRecipeKey(key: string, label: string): void {
  if (key.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty mapping key`);
  }
}

function assertMappingValue(value: YValue, label: string): Record<string, YValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a mapping value`);
  }
  return value as Record<string, YValue>;
}

function assertSequenceValue(value: YValue, label: string): YValue[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be a sequence value`);
  }
  return value;
}

function hasOwn(value: Record<string, YValue>, key: string): boolean {
  return Object.hasOwn(value, key);
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

export function compileYOpsPathClone(input: CompileYOpsPathCloneInput): readonly YOp[] {
  assertDistinctRecipePaths(input.from, input.to);
  if (input.destination.state !== 'absent') {
    throw new TypeError('YOps clone recipe destination must be absent');
  }
  return [
    { assert: { path: input.from, equals: cloneYValue(input.source.value) } },
    { assert: { path: input.to, exists: false } },
    { set: { path: input.to, value: cloneYValue(input.source.value) } },
  ];
}

export function compileYOpsPathMove(input: CompileYOpsPathMoveInput): readonly YOp[] {
  assertDistinctRecipePaths(input.from, input.to);
  assertMoveDestinationIsOutsideSource(input.from, input.to);
  return [...compileYOpsPathClone(input), { unset: { path: input.from } }];
}

export function compileYOpsMappingKeyRename(
  input: CompileYOpsMappingKeyRenameInput
): readonly YOp[] {
  assertRecipePath(input.path);
  assertRecipeKey(input.from, 'from');
  assertRecipeKey(input.to, 'to');
  if (input.from === input.to) return [];

  const base = assertMappingValue(input.base.value, 'base');
  if (!hasOwn(base, input.from)) {
    throw new TypeError(`Cannot rename missing key: ${input.from}`);
  }
  if (hasOwn(base, input.to)) {
    throw new TypeError(`Cannot rename ${input.from} to existing key: ${input.to}`);
  }

  const target: Record<string, YValue> = {};
  for (const [key, value] of Object.entries(base)) {
    target[key === input.from ? input.to : key] = cloneYValue(value);
  }

  return [
    { assert: { path: input.path, equals: cloneYValue(input.base.value) } },
    { set: { path: input.path, value: target } },
  ];
}

function assertMappingKeyList(
  keys: readonly string[],
  base: Record<string, YValue>,
  action: 'pick' | 'omit'
): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    assertRecipeKey(key, 'key');
    if (out.has(key)) {
      throw new TypeError(`Duplicate ${action === 'pick' ? 'picked' : 'omitted'} key: ${key}`);
    }
    if (!hasOwn(base, key)) {
      throw new TypeError(`Cannot ${action} missing key: ${key}`);
    }
    out.add(key);
  }
  return out;
}

export function compileYOpsMappingKeyPick(input: CompileYOpsMappingKeyPickInput): readonly YOp[] {
  assertRecipePath(input.path);
  const base = assertMappingValue(input.base.value, 'base');
  const keys = assertMappingKeyList(input.keys, base, 'pick');
  const target: Record<string, YValue> = {};
  for (const key of keys) {
    target[key] = cloneYValue(base[key]!);
  }
  if (canonicalJson(target) === canonicalJson(base)) return [];
  return [
    { assert: { path: input.path, equals: cloneYValue(input.base.value) } },
    { set: { path: input.path, value: target } },
  ];
}

export function compileYOpsSequenceAppend(input: CompileYOpsSequenceAppendInput): readonly YOp[] {
  assertRecipePath(input.path);
  const base = assertSequenceValue(input.base.value, 'base');
  return [
    { assert: { path: input.path, equals: cloneYValue(input.base.value) } },
    {
      set: {
        path: input.path,
        value: [...base.map((item) => cloneYValue(item)), cloneYValue(input.value)],
      },
    },
  ];
}

export function compileYOpsMappingKeyOmit(input: CompileYOpsMappingKeyOmitInput): readonly YOp[] {
  assertRecipePath(input.path);
  const base = assertMappingValue(input.base.value, 'base');
  if (input.keys.length === 0) return [];

  const keys = assertMappingKeyList(input.keys, base, 'omit');

  const target: Record<string, YValue> = {};
  for (const [key, value] of Object.entries(base)) {
    if (!keys.has(key)) target[key] = cloneYValue(value);
  }

  return [
    { assert: { path: input.path, equals: cloneYValue(input.base.value) } },
    { set: { path: input.path, value: target } },
  ];
}

const replacePathCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_REPLACE_PATH_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description:
    'Compile a base-aware path replacement into assert + set/unset primitive operations.',
  outputOperationNames: YOPS_PRIMITIVE_OPERATION_NAMES,
  compile: compileYOpsPathReplacement,
});

const clonePathCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_CLONE_PATH_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile a path clone into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) => compileYOpsPathClone(input as CompileYOpsPathCloneInput),
});

const movePathCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_MOVE_PATH_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile a path move into assert + set + unset primitive operations.',
  outputOperationNames: YOPS_PRIMITIVE_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) => compileYOpsPathMove(input as CompileYOpsPathMoveInput),
});

const renameMappingKeyCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_RENAME_MAPPING_KEY_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile a mapping-key rename into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsMappingKeyRename(input as CompileYOpsMappingKeyRenameInput),
});

const appendSequenceItemCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile a sequence append into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsSequenceAppend(input as CompileYOpsSequenceAppendInput),
});

const pickMappingKeysCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_PICK_MAPPING_KEYS_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile mapping-key selection into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsMappingKeyPick(input as CompileYOpsMappingKeyPickInput),
});

const omitMappingKeysCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_OMIT_MAPPING_KEYS_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile mapping-key omission into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsMappingKeyOmit(input as CompileYOpsMappingKeyOmitInput),
});

const YOPS_RECIPE_COMPILERS = Object.freeze({
  [YOPS_RECIPE_REPLACE_PATH_ID]: replacePathCompiler,
  [YOPS_RECIPE_CLONE_PATH_ID]: clonePathCompiler,
  [YOPS_RECIPE_MOVE_PATH_ID]: movePathCompiler,
  [YOPS_RECIPE_RENAME_MAPPING_KEY_ID]: renameMappingKeyCompiler,
  [YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID]: appendSequenceItemCompiler,
  [YOPS_RECIPE_PICK_MAPPING_KEYS_ID]: pickMappingKeysCompiler,
  [YOPS_RECIPE_OMIT_MAPPING_KEYS_ID]: omitMappingKeysCompiler,
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

export function createYOpsRecipeInvocation(
  recipeId: YOpsRecipeId,
  input: YOpsRecipeInput,
  options: { readonly why?: string } = {}
): YOpsRecipeInvocation {
  const compiler = getYOpsRecipeCompiler(recipeId);
  if (!compiler) throw new TypeError(`Unknown YOps recipe compiler: ${recipeId}`);
  const why = options.why?.trim();
  if (options.why !== undefined && !why) {
    throw new TypeError('YOps recipe invocation why must be a non-empty string when provided');
  }
  return {
    schema: YOPS_RECIPE_INVOCATION_SCHEMA,
    recipeId,
    profile: compiler.profile,
    input: cloneRecipeInput(input),
    ...(why === undefined ? {} : { why }),
  };
}

function assertYOpsRecipeInvocation(invocation: YOpsRecipeInvocation): YOpsRecipeCompiler {
  if (invocation.schema !== YOPS_RECIPE_INVOCATION_SCHEMA) {
    throw new TypeError(`Unsupported YOps recipe invocation schema: ${invocation.schema}`);
  }
  const compiler = getYOpsRecipeCompiler(invocation.recipeId);
  if (!compiler) throw new TypeError(`Unknown YOps recipe compiler: ${invocation.recipeId}`);
  if (invocation.profile !== compiler.profile) {
    throw new TypeError(
      `YOps recipe ${invocation.recipeId} requires profile ${compiler.profile}, got ${invocation.profile}`
    );
  }
  return compiler;
}

export function canonicalYOpsRecipeInvocation(invocation: YOpsRecipeInvocation): string {
  assertYOpsRecipeInvocation(invocation);
  return canonicalJson(invocation as unknown as YValue);
}

export function canonicalYOpsRecipeExpansion(expansion: YOpsRecipeExpansion): string {
  if (expansion.schema !== YOPS_RECIPE_EXPANSION_SCHEMA) {
    throw new TypeError(`Unsupported YOps recipe expansion schema: ${expansion.schema}`);
  }
  return canonicalJson(expansion as unknown as YValue);
}

export function compileYOpsRecipeInvocation(
  invocation: YOpsRecipeInvocation
): CompileYOpsRecipeInvocationResult {
  const compiler = assertYOpsRecipeInvocation(invocation);
  const operations = compiler.compile(invocation.input).map(cloneYOp);
  const expansion: YOpsRecipeExpansion = {
    schema: YOPS_RECIPE_EXPANSION_SCHEMA,
    recipeId: invocation.recipeId,
    profile: compiler.profile,
    outputOperationNames: compiler.outputOperationNames,
    operationCount: operations.length,
    operations,
  };
  return {
    invocation: createYOpsRecipeInvocation(invocation.recipeId, invocation.input, {
      why: invocation.why,
    }),
    invocationCanonicalJson: canonicalYOpsRecipeInvocation(invocation),
    expansion,
    expansionCanonicalJson: canonicalYOpsRecipeExpansion(expansion),
    operations,
  };
}

export function compileYOpsRecipeInvocations(
  invocations: readonly YOpsRecipeInvocation[]
): CompileYOpsRecipeInvocationsResult {
  const expansions = invocations.map((invocation) => compileYOpsRecipeInvocation(invocation));
  return {
    expansions,
    operations: expansions.flatMap((expansion) => expansion.operations.map(cloneYOp)),
  };
}
