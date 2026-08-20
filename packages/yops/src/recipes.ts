import { canonicalJson, canonicalKey, compareYValues } from './canonical';
import { createEngine } from './engine';
import { registerAllHandlers } from './handlers';
import { type PathSegment, parsePath, resolvePath } from './paths';
import { OpRegistry } from './registry';
import { parseSpec } from './spec';
import { SPEC_YAML } from './specData';
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
export const YOPS_RECIPE_POPULATE_MAPPING_ID = 'yops.recipe.populate-mapping.v1' as const;
export const YOPS_RECIPE_NEST_MAPPING_KEYS_ID = 'yops.recipe.nest-mapping-keys.v1' as const;
export const YOPS_RECIPE_SPLIT_MAPPING_GROUPS_ID = 'yops.recipe.split-mapping-groups.v1' as const;
export const YOPS_RECIPE_FOLD_MAPPING_CHILD_ID = 'yops.recipe.fold-mapping-child.v1' as const;
export const YOPS_RECIPE_MERGE_MAPPING_KEYS_ID = 'yops.recipe.merge-mapping-keys.v1' as const;
export const YOPS_RECIPE_SORT_SEQUENCE_ID = 'yops.recipe.sort-sequence.v1' as const;
export const YOPS_RECIPE_UNIQUE_SEQUENCE_ID = 'yops.recipe.unique-sequence.v1' as const;
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

export interface CompileYOpsMappingPopulateInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly values: Readonly<Record<string, YValue>>;
}

export interface CompileYOpsMappingNestInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly keys: readonly string[];
  readonly under: string;
}

export interface CompileYOpsMappingSplitInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly into: Readonly<Record<string, readonly string[]>>;
}

export interface CompileYOpsMappingFoldInput {
  readonly path: string;
  readonly parentPath: string;
  readonly parentBase: YOpsPresentPathValue;
}

export interface CompileYOpsMappingMergeInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly keys: readonly string[];
  readonly into: string;
}

export interface CompileYOpsSequenceSortInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly by?: string;
  readonly order?: 'asc' | 'desc';
}

export interface CompileYOpsSequenceUniqueInput {
  readonly path: string;
  readonly base: YOpsPresentPathValue;
  readonly by?: string;
}

export type YOpsRecipeId =
  | typeof YOPS_RECIPE_REPLACE_PATH_ID
  | typeof YOPS_RECIPE_CLONE_PATH_ID
  | typeof YOPS_RECIPE_MOVE_PATH_ID
  | typeof YOPS_RECIPE_RENAME_MAPPING_KEY_ID
  | typeof YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID
  | typeof YOPS_RECIPE_PICK_MAPPING_KEYS_ID
  | typeof YOPS_RECIPE_OMIT_MAPPING_KEYS_ID
  | typeof YOPS_RECIPE_POPULATE_MAPPING_ID
  | typeof YOPS_RECIPE_NEST_MAPPING_KEYS_ID
  | typeof YOPS_RECIPE_SPLIT_MAPPING_GROUPS_ID
  | typeof YOPS_RECIPE_FOLD_MAPPING_CHILD_ID
  | typeof YOPS_RECIPE_MERGE_MAPPING_KEYS_ID
  | typeof YOPS_RECIPE_SORT_SEQUENCE_ID
  | typeof YOPS_RECIPE_UNIQUE_SEQUENCE_ID;
export type YOpsRecipeInput =
  | CompileYOpsPathReplacementInput
  | CompileYOpsPathCloneInput
  | CompileYOpsPathMoveInput
  | CompileYOpsMappingKeyRenameInput
  | CompileYOpsSequenceAppendInput
  | CompileYOpsMappingKeyOmitInput
  | CompileYOpsMappingKeyPickInput
  | CompileYOpsMappingPopulateInput
  | CompileYOpsMappingNestInput
  | CompileYOpsMappingSplitInput
  | CompileYOpsMappingFoldInput
  | CompileYOpsMappingMergeInput
  | CompileYOpsSequenceSortInput
  | CompileYOpsSequenceUniqueInput;

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

export interface CompileYOpsOperationsToPrimitiveProfileResult {
  readonly expansions: readonly CompileYOpsRecipeInvocationResult[];
  readonly operations: readonly YOp[];
  readonly retainedOperationNames: readonly YOpsV1OperationName[];
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

function cloneMappingValue(value: Record<string, YValue>): Record<string, YValue> {
  return cloneYValue(value) as Record<string, YValue>;
}

function mappingPathReplacement(path: string, base: YValue, target: YValue): readonly YOp[] {
  if (canonicalJson(base) === canonicalJson(target)) return [];
  return [
    { assert: { path, equals: cloneYValue(base) } },
    { set: { path, value: cloneYValue(target) } },
  ];
}

function assertSequenceSortKey(item: YValue, by: string, path: string): Record<string, YValue> {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError(`sort by "${by}" requires every item at "${path}" to be a mapping`);
  }
  const map = item as Record<string, YValue>;
  if (!hasOwn(map, by)) {
    throw new TypeError(`sort by "${by}" requires every item at "${path}" to contain that key`);
  }
  return map;
}

function assertSequenceUniqueKey(item: YValue, by: string, path: string): Record<string, YValue> {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError(`unique by "${by}" requires every item at "${path}" to be a mapping`);
  }
  const map = item as Record<string, YValue>;
  if (!hasOwn(map, by)) {
    throw new TypeError(`unique by "${by}" requires every item at "${path}" to contain that key`);
  }
  return map;
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

export function compileYOpsMappingPopulate(input: CompileYOpsMappingPopulateInput): readonly YOp[] {
  assertRecipePath(input.path);
  const base = assertMappingValue(input.base.value, 'base');
  const target = cloneMappingValue(base);
  for (const [key, value] of Object.entries(input.values)) {
    assertRecipeKey(key, 'populate key');
    target[key] = cloneYValue(value);
  }
  return mappingPathReplacement(input.path, input.base.value, target);
}

export function compileYOpsMappingNest(input: CompileYOpsMappingNestInput): readonly YOp[] {
  assertRecipePath(input.path);
  assertRecipeKey(input.under, 'under');
  const base = assertMappingValue(input.base.value, 'base');
  const keys = assertMappingKeyList(input.keys, base, 'pick');
  if (keys.size === 0) return [];
  if (hasOwn(base, input.under) && !keys.has(input.under)) {
    throw new TypeError(`Cannot nest into existing key: ${input.under}`);
  }

  const nested: Record<string, YValue> = {};
  for (const key of input.keys) {
    nested[key] = cloneYValue(base[key]!);
  }
  const target: Record<string, YValue> = {};
  for (const [key, value] of Object.entries(base)) {
    if (!keys.has(key)) target[key] = cloneYValue(value);
  }
  target[input.under] = nested;

  return mappingPathReplacement(input.path, input.base.value, target);
}

export function compileYOpsMappingSplit(input: CompileYOpsMappingSplitInput): readonly YOp[] {
  assertRecipePath(input.path);
  const base = assertMappingValue(input.base.value, 'base');
  const seenSourceKeys = new Set<string>();
  for (const groupKeys of Object.values(input.into)) {
    for (const key of groupKeys) {
      assertRecipeKey(key, 'split source key');
      if (seenSourceKeys.has(key)) {
        throw new TypeError(`Key cannot be assigned to multiple split groups: ${key}`);
      }
      if (!hasOwn(base, key)) {
        throw new TypeError(`Cannot split missing key: ${key}`);
      }
      seenSourceKeys.add(key);
    }
  }

  for (const groupName of Object.keys(input.into)) {
    assertRecipeKey(groupName, 'split group name');
    if (hasOwn(base, groupName) && !seenSourceKeys.has(groupName)) {
      throw new TypeError(`Cannot split into existing group name: ${groupName}`);
    }
  }

  const target: Record<string, YValue> = {};
  for (const [key, value] of Object.entries(base)) {
    if (!seenSourceKeys.has(key)) target[key] = cloneYValue(value);
  }
  for (const [groupName, groupKeys] of Object.entries(input.into)) {
    const group: Record<string, YValue> = {};
    for (const key of groupKeys) {
      group[key] = cloneYValue(base[key]!);
    }
    target[groupName] = group;
  }

  return mappingPathReplacement(input.path, input.base.value, target);
}

export function compileYOpsMappingFold(input: CompileYOpsMappingFoldInput): readonly YOp[] {
  assertRecipePath(input.path);
  assertRecipePath(input.parentPath);
  const parentBase = assertMappingValue(input.parentBase.value, 'parentBase');
  const segments = parsePath(input.path);
  const foldedSegment = segments.at(-1);
  if (foldedSegment?.type !== 'key') {
    throw new TypeError(`YOps fold recipe path must end in a mapping key: ${input.path}`);
  }
  if (!hasOwn(parentBase, foldedSegment.value)) {
    throw new TypeError(`Cannot fold missing key: ${foldedSegment.value}`);
  }
  const folded = assertMappingValue(parentBase[foldedSegment.value]!, 'folded mapping');
  const childKeys = Object.keys(folded);
  if (childKeys.length !== 1) {
    throw new TypeError(
      `Folded mapping at "${input.path}" has ${childKeys.length} keys; expected exactly one`
    );
  }
  const childKey = childKeys[0]!;
  const target: Record<string, YValue> = {};
  for (const [key, value] of Object.entries(parentBase)) {
    if (key !== foldedSegment.value) target[key] = cloneYValue(value);
  }
  target[childKey] = cloneYValue(folded[childKey]!);

  return mappingPathReplacement(input.parentPath, input.parentBase.value, target);
}

export function compileYOpsMappingMerge(input: CompileYOpsMappingMergeInput): readonly YOp[] {
  assertRecipePath(input.path);
  assertRecipeKey(input.into, 'into');
  const base = assertMappingValue(input.base.value, 'base');
  const keys = assertMappingKeyList(input.keys, base, 'pick');
  const merged: Record<string, YValue> = {};
  for (const key of input.keys) {
    const value = assertMappingValue(base[key]!, `merge source ${key}`);
    for (const [mergedKey, mergedValue] of Object.entries(value)) {
      merged[mergedKey] = cloneYValue(mergedValue);
    }
  }

  const target: Record<string, YValue> = {};
  for (const [key, value] of Object.entries(base)) {
    if (!keys.has(key)) target[key] = cloneYValue(value);
  }
  target[input.into] = merged;

  return mappingPathReplacement(input.path, input.base.value, target);
}

export function compileYOpsSequenceSort(input: CompileYOpsSequenceSortInput): readonly YOp[] {
  assertRecipePath(input.path);
  const base = assertSequenceValue(input.base.value, 'base');
  const target = base.map((item) => cloneYValue(item));
  const order = input.order ?? 'asc';
  if (input.by !== undefined) {
    assertRecipeKey(input.by, 'sort key');
    for (const item of target) assertSequenceSortKey(item, input.by, input.path);
  }
  target.sort((a, b) => {
    const left =
      input.by === undefined ? a : assertSequenceSortKey(a, input.by, input.path)[input.by]!;
    const right =
      input.by === undefined ? b : assertSequenceSortKey(b, input.by, input.path)[input.by]!;
    const comparison = compareYValues(left, right);
    return order === 'desc' ? -comparison : comparison;
  });
  return mappingPathReplacement(input.path, input.base.value, target);
}

export function compileYOpsSequenceUnique(input: CompileYOpsSequenceUniqueInput): readonly YOp[] {
  assertRecipePath(input.path);
  const base = assertSequenceValue(input.base.value, 'base');
  if (input.by !== undefined) {
    assertRecipeKey(input.by, 'unique key');
    for (const item of base) assertSequenceUniqueKey(item, input.by, input.path);
  }

  const seen = new Set<string>();
  const target: YValue[] = [];
  for (const item of base) {
    const key =
      input.by === undefined
        ? canonicalKey(item)
        : canonicalKey(assertSequenceUniqueKey(item, input.by, input.path)[input.by]!);
    if (!seen.has(key)) {
      seen.add(key);
      target.push(cloneYValue(item));
    }
  }
  return mappingPathReplacement(input.path, input.base.value, target);
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

const populateMappingCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_POPULATE_MAPPING_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile mapping population into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsMappingPopulate(input as CompileYOpsMappingPopulateInput),
});

const nestMappingKeysCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_NEST_MAPPING_KEYS_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile mapping-key nesting into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) => compileYOpsMappingNest(input as CompileYOpsMappingNestInput),
});

const splitMappingGroupsCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_SPLIT_MAPPING_GROUPS_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile mapping-key splitting into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsMappingSplit(input as CompileYOpsMappingSplitInput),
});

const foldMappingChildCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_FOLD_MAPPING_CHILD_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile single-child mapping folding into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) => compileYOpsMappingFold(input as CompileYOpsMappingFoldInput),
});

const mergeMappingKeysCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_MERGE_MAPPING_KEYS_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile mapping-key merging into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsMappingMerge(input as CompileYOpsMappingMergeInput),
});

const sortSequenceCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_SORT_SEQUENCE_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile sequence sorting into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsSequenceSort(input as CompileYOpsSequenceSortInput),
});

const uniqueSequenceCompiler: YOpsRecipeCompiler = Object.freeze({
  id: YOPS_RECIPE_UNIQUE_SEQUENCE_ID,
  profile: YOPS_PRIMITIVE_V2_CANDIDATE_PROFILE_ID,
  description: 'Compile sequence deduplication into assert + set primitive operations.',
  outputOperationNames: YOPS_ASSERT_SET_OPERATION_NAMES,
  compile: (input: YOpsRecipeInput) =>
    compileYOpsSequenceUnique(input as CompileYOpsSequenceUniqueInput),
});

const YOPS_RECIPE_COMPILERS = Object.freeze({
  [YOPS_RECIPE_REPLACE_PATH_ID]: replacePathCompiler,
  [YOPS_RECIPE_CLONE_PATH_ID]: clonePathCompiler,
  [YOPS_RECIPE_MOVE_PATH_ID]: movePathCompiler,
  [YOPS_RECIPE_RENAME_MAPPING_KEY_ID]: renameMappingKeyCompiler,
  [YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID]: appendSequenceItemCompiler,
  [YOPS_RECIPE_PICK_MAPPING_KEYS_ID]: pickMappingKeysCompiler,
  [YOPS_RECIPE_OMIT_MAPPING_KEYS_ID]: omitMappingKeysCompiler,
  [YOPS_RECIPE_POPULATE_MAPPING_ID]: populateMappingCompiler,
  [YOPS_RECIPE_NEST_MAPPING_KEYS_ID]: nestMappingKeysCompiler,
  [YOPS_RECIPE_SPLIT_MAPPING_GROUPS_ID]: splitMappingGroupsCompiler,
  [YOPS_RECIPE_FOLD_MAPPING_CHILD_ID]: foldMappingChildCompiler,
  [YOPS_RECIPE_MERGE_MAPPING_KEYS_ID]: mergeMappingKeysCompiler,
  [YOPS_RECIPE_SORT_SEQUENCE_ID]: sortSequenceCompiler,
  [YOPS_RECIPE_UNIQUE_SEQUENCE_ID]: uniqueSequenceCompiler,
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

let recipeReplayApplyYOps: ReturnType<typeof createEngine>['applyYOps'] | undefined;

function applyRecipeReplay(doc: YValue, ops: readonly YOp[]) {
  if (recipeReplayApplyYOps === undefined) {
    const registry = new OpRegistry(parseSpec(SPEC_YAML));
    registerAllHandlers(registry);
    registry.validate();
    recipeReplayApplyYOps = createEngine(registry).applyYOps;
  }
  return recipeReplayApplyYOps(doc, ops.map(cloneYOp));
}

function operationName(op: YOp): YOpsV1OperationName {
  if ('define' in op) return 'define';
  if ('drop' in op) return 'drop';
  if ('rename' in op) return 'rename';
  if ('set' in op) return 'set';
  if ('unset' in op) return 'unset';
  if ('populate' in op) return 'populate';
  if ('append' in op) return 'append';
  if ('move' in op) return 'move';
  if ('clone' in op) return 'clone';
  if ('nest' in op) return 'nest';
  if ('split' in op) return 'split';
  if ('fold' in op) return 'fold';
  if ('merge' in op) return 'merge';
  if ('sort' in op) return 'sort';
  if ('unique' in op) return 'unique';
  if ('pick' in op) return 'pick';
  if ('omit' in op) return 'omit';
  return 'assert';
}

function pathValueAt(doc: YValue, path: string): YOpsPathValue {
  const value = resolvePath(doc, path);
  return value === undefined
    ? { state: 'absent' }
    : { state: 'present', value: cloneYValue(value) };
}

function presentPathValueAt(doc: YValue, path: string): YOpsPresentPathValue | null {
  const value = pathValueAt(doc, path);
  return value.state === 'present' ? value : null;
}

function formatPathSegment(segment: PathSegment): string {
  if (segment.type === 'index') return `[${segment.value}]`;
  if (segment.type === 'match') return `[${segment.key}=${segment.value}]`;
  if (segment.value.length > 0 && !/[/"\\[\]=]/.test(segment.value)) return segment.value;
  return `"${segment.value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function formatPathSegments(segments: readonly PathSegment[]): string {
  return segments.map(formatPathSegment).join('/');
}

function splitLastKeyPath(path: string): { parentPath: string; key: string } | null {
  const segments = parsePath(path);
  const last = segments.at(-1);
  if (last?.type !== 'key') return null;
  return {
    parentPath: formatPathSegments(segments.slice(0, -1)),
    key: last.value,
  };
}

function createYOpsRecipeInvocationForNativeOperation(
  base: YValue,
  op: YOp
): YOpsRecipeInvocation | null {
  if ('clone' in op) {
    const source = presentPathValueAt(base, op.clone.from);
    if (source === null) return null;
    const destination = pathValueAt(base, op.clone.to);
    if (destination.state !== 'absent') return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_CLONE_PATH_ID, {
      from: op.clone.from,
      to: op.clone.to,
      source,
      destination,
    });
  }
  if ('move' in op) {
    const source = presentPathValueAt(base, op.move.from);
    if (source === null) return null;
    const destination = pathValueAt(base, op.move.to);
    if (destination.state !== 'absent') return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_MOVE_PATH_ID, {
      from: op.move.from,
      to: op.move.to,
      source,
      destination,
    });
  }
  if ('rename' in op) {
    const split = splitLastKeyPath(op.rename.path);
    if (split === null || split.parentPath.length === 0) return null;
    const parent = presentPathValueAt(base, split.parentPath);
    if (parent === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_RENAME_MAPPING_KEY_ID, {
      path: split.parentPath,
      base: parent,
      from: split.key,
      to: op.rename.to,
    });
  }
  if ('append' in op) {
    const sequence = presentPathValueAt(base, op.append.path);
    if (sequence === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_APPEND_SEQUENCE_ITEM_ID, {
      path: op.append.path,
      base: sequence,
      value: op.append.value,
    });
  }
  if ('pick' in op) {
    if (op.pick.path.length === 0) return null;
    const mapping = presentPathValueAt(base, op.pick.path);
    if (mapping === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_PICK_MAPPING_KEYS_ID, {
      path: op.pick.path,
      base: mapping,
      keys: [...op.pick.keys],
    });
  }
  if ('omit' in op) {
    if (op.omit.path.length === 0) return null;
    const mapping = presentPathValueAt(base, op.omit.path);
    if (mapping === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_OMIT_MAPPING_KEYS_ID, {
      path: op.omit.path,
      base: mapping,
      keys: [...op.omit.keys],
    });
  }
  if ('populate' in op) {
    const mapping = presentPathValueAt(base, op.populate.path);
    if (mapping === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_POPULATE_MAPPING_ID, {
      path: op.populate.path,
      base: mapping,
      values: cloneMappingValue(op.populate.values),
    });
  }
  if ('nest' in op) {
    if (op.nest.path.length === 0) return null;
    const mapping = presentPathValueAt(base, op.nest.path);
    if (mapping === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_NEST_MAPPING_KEYS_ID, {
      path: op.nest.path,
      base: mapping,
      keys: [...op.nest.keys],
      under: op.nest.under,
    });
  }
  if ('split' in op) {
    if (op.split.path.length === 0) return null;
    const mapping = presentPathValueAt(base, op.split.path);
    if (mapping === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_SPLIT_MAPPING_GROUPS_ID, {
      path: op.split.path,
      base: mapping,
      into: structuredClone(op.split.into),
    });
  }
  if ('fold' in op) {
    const split = splitLastKeyPath(op.fold.path);
    if (split === null || split.parentPath.length === 0) return null;
    const parent = presentPathValueAt(base, split.parentPath);
    if (parent === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_FOLD_MAPPING_CHILD_ID, {
      path: op.fold.path,
      parentPath: split.parentPath,
      parentBase: parent,
    });
  }
  if ('merge' in op) {
    if (op.merge.path.length === 0) return null;
    const mapping = presentPathValueAt(base, op.merge.path);
    if (mapping === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_MERGE_MAPPING_KEYS_ID, {
      path: op.merge.path,
      base: mapping,
      keys: [...op.merge.keys],
      into: op.merge.into,
    });
  }
  if ('sort' in op) {
    const sequence = presentPathValueAt(base, op.sort.path);
    if (sequence === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_SORT_SEQUENCE_ID, {
      path: op.sort.path,
      base: sequence,
      ...(op.sort.by === undefined ? {} : { by: op.sort.by }),
      ...(op.sort.order === undefined ? {} : { order: op.sort.order }),
    });
  }
  if ('unique' in op) {
    const sequence = presentPathValueAt(base, op.unique.path);
    if (sequence === null) return null;
    return createYOpsRecipeInvocation(YOPS_RECIPE_UNIQUE_SEQUENCE_ID, {
      path: op.unique.path,
      base: sequence,
      ...(op.unique.by === undefined ? {} : { by: op.unique.by }),
    });
  }
  return null;
}

export function compileYOpsOperationsToPrimitiveProfile(input: {
  readonly base: YValue;
  readonly operations: readonly YOp[];
}): CompileYOpsOperationsToPrimitiveProfileResult {
  let current = cloneYValue(input.base);
  const expansions: CompileYOpsRecipeInvocationResult[] = [];
  const operations: YOp[] = [];
  const retainedOperationNames: YOpsV1OperationName[] = [];

  for (let index = 0; index < input.operations.length; index += 1) {
    const op = input.operations[index]!;
    const nativeResult = applyRecipeReplay(current, [op]);
    if (!nativeResult.ok) {
      for (const remaining of input.operations.slice(index)) {
        operations.push(cloneYOp(remaining));
        retainedOperationNames.push(operationName(remaining));
      }
      break;
    }

    let expansion: CompileYOpsRecipeInvocationResult | null = null;
    try {
      const invocation = createYOpsRecipeInvocationForNativeOperation(current, op);
      expansion = invocation === null ? null : compileYOpsRecipeInvocation(invocation);
    } catch {
      expansion = null;
    }

    if (expansion !== null) {
      const compiledResult = applyRecipeReplay(current, expansion.operations);
      if (
        compiledResult.ok &&
        canonicalJson(compiledResult.doc) === canonicalJson(nativeResult.doc)
      ) {
        expansions.push(expansion);
        operations.push(...expansion.operations.map(cloneYOp));
        current = nativeResult.doc;
        continue;
      }
    }

    operations.push(cloneYOp(op));
    retainedOperationNames.push(operationName(op));
    current = nativeResult.doc;
  }

  return { expansions, operations, retainedOperationNames };
}
