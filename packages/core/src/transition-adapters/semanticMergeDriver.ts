import { createHash } from 'node:crypto';
import {
  canonicalizeProtocolValue,
  type Digest,
  describeProtocolObject,
  EFFECT_SCHEMA,
  type Effect,
  type EffectDefinition,
  IntegrityChainInvalidError,
  type MutationDriver,
  type MutationDriverRef,
  type MutationDriverRegistry,
  mutationDriverKey,
  type ProtocolObject,
  type ProtocolValue,
  parseEffect,
  parseState,
  type ResolvedInputs,
  replay,
  STATE_SCHEMA,
  StaleBaseError,
  type State,
  type StateDescriptor,
  UnsupportedMediaTypeError,
  UnsupportedSemanticsError,
} from '@t3x-dev/transition';
import type { YValue } from '@t3x-dev/yops';
import { executeMerge, prepareMerge } from '../semantic/merge';
import type {
  MergeDecision,
  MergeResolution,
  MergeResult,
  SemanticContent,
  TreeNode,
} from '../semantic/types';
import { createYOpsState, yopsStateCodec } from './stateCodec';

export const SEMANTIC_MERGE_DRIVER_PROTOCOL = 't3x.dev/yops-semantic-merge' as const;
export const SEMANTIC_MERGE_DRIVER_PROTOCOL_VERSION = '1' as const;
export const SEMANTIC_MERGE_OPERATION_SCHEMA = 't3x.dev/yops-semantic-merge-operation/v1' as const;
export const REPOSITORY_SEMANTIC_CONTENT_DOMAIN = 't3x.dev/semantic-content' as const;
export const REPOSITORY_SEMANTIC_CONTENT_VERSION = 1 as const;

const SEMANTIC_MERGE_SPEC_DIGEST_DOMAIN = 't3x-yops-semantic-merge-driver-spec-v1' as const;
const MERGE_BASE_ROLE = 'merge-base' as const;
const MERGE_SOURCE_ROLE = 'merge-source' as const;

const semanticMergeDriverSpec: ProtocolValue = {
  protocol: SEMANTIC_MERGE_DRIVER_PROTOCOL,
  protocolVersion: SEMANTIC_MERGE_DRIVER_PROTOCOL_VERSION,
  stateCodec: {
    mediaType: yopsStateCodec.mediaType,
    version: yopsStateCodec.version,
    domain: REPOSITORY_SEMANTIC_CONTENT_DOMAIN,
    domainVersion: REPOSITORY_SEMANTIC_CONTENT_VERSION,
  },
  algorithm: '@t3x-dev/core/semantic-three-way-merge/v1',
  operations: [{ schema: SEMANTIC_MERGE_OPERATION_SCHEMA, cardinality: 'exactly_one' }],
  inputs: [
    { role: MERGE_BASE_ROLE, kind: 'state', cardinality: 'exactly_one' },
    { role: MERGE_SOURCE_ROLE, kind: 'state', cardinality: 'exactly_one' },
  ],
};

function computeSemanticMergeSpecDigest(): Digest {
  const hex = createHash('sha256')
    .update(`${SEMANTIC_MERGE_SPEC_DIGEST_DOMAIN}\0`, 'utf8')
    .update(canonicalizeProtocolValue(semanticMergeDriverSpec), 'utf8')
    .digest('hex');
  return `sha256:${hex}`;
}

/** Pins the exact merge algorithm, State domain, and operation contract. */
export const SEMANTIC_MERGE_DRIVER_SPEC_DIGEST = computeSemanticMergeSpecDigest();

export const SEMANTIC_MERGE_MUTATION_DRIVER_REF: Readonly<MutationDriverRef> = Object.freeze({
  protocol: SEMANTIC_MERGE_DRIVER_PROTOCOL,
  protocolVersion: SEMANTIC_MERGE_DRIVER_PROTOCOL_VERSION,
  specDigest: SEMANTIC_MERGE_DRIVER_SPEC_DIGEST,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], path: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new UnsupportedSemanticsError(`${path} must contain exactly ${expected.join(', ')}`);
  }
}

function assertTreeNode(value: unknown, path: string): asserts value is TreeNode {
  if (!isRecord(value) || typeof value.key !== 'string' || !isRecord(value.slots)) {
    throw new UnsupportedSemanticsError(`${path} must be a semantic TreeNode`);
  }
  if (!Array.isArray(value.children)) {
    throw new UnsupportedSemanticsError(`${path}.children must be an array`);
  }
  value.children.forEach((child, index) => assertTreeNode(child, `${path}.children[${index}]`));
}

function assertSemanticContent(value: unknown): asserts value is SemanticContent {
  if (!isRecord(value) || !Array.isArray(value.trees) || !Array.isArray(value.relations)) {
    throw new UnsupportedSemanticsError('Repository semantic content requires trees and relations');
  }
  value.trees.forEach((tree, index) => assertTreeNode(tree, `$.content.trees[${index}]`));
  for (const [index, relation] of value.relations.entries()) {
    if (
      !isRecord(relation) ||
      typeof relation.from !== 'string' ||
      typeof relation.to !== 'string' ||
      typeof relation.type !== 'string'
    ) {
      throw new UnsupportedSemanticsError(
        `$.content.relations[${index}] must be a semantic Relation`
      );
    }
  }
}

/** Losslessly encode repository SemanticContent in the versioned YOps State domain. */
export function createRepositorySemanticState(content: SemanticContent): State {
  assertSemanticContent(content);
  return createYOpsState({
    domain: REPOSITORY_SEMANTIC_CONTENT_DOMAIN,
    version: REPOSITORY_SEMANTIC_CONTENT_VERSION,
    content,
  } as unknown as YValue);
}

/** Decode only the explicit repository SemanticContent State domain. */
export function decodeRepositorySemanticState(state: State): SemanticContent {
  const parsed = parseState(state);
  if (
    parsed.codec.mediaType !== yopsStateCodec.mediaType ||
    parsed.codec.version !== yopsStateCodec.version
  ) {
    throw new UnsupportedMediaTypeError(
      `Repository SemanticContent requires ${yopsStateCodec.mediaType}@${yopsStateCodec.version}`
    );
  }
  const decoded = yopsStateCodec.decode(parsed.value);
  if (
    !isRecord(decoded) ||
    decoded.domain !== REPOSITORY_SEMANTIC_CONTENT_DOMAIN ||
    decoded.version !== REPOSITORY_SEMANTIC_CONTENT_VERSION ||
    !isRecord(decoded.content)
  ) {
    throw new UnsupportedSemanticsError(
      'State is not a t3x.dev/semantic-content version 1 YOps document'
    );
  }
  assertSemanticContent(decoded.content);
  return decoded.content;
}

function stringSet(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((member) => typeof member !== 'string')) {
    throw new UnsupportedSemanticsError(`${path} must be an array of strings`);
  }
  const normalized = [...new Set(value as string[])].sort();
  if (
    normalized.length !== value.length ||
    normalized.some((item, index) => item !== value[index])
  ) {
    throw new UnsupportedSemanticsError(`${path} must be a sorted set`);
  }
  return normalized;
}

function parseResolution(value: unknown, path: string): MergeResolution {
  if (value === 'source' || value === 'target' || value === 'both') return value;
  if (isRecord(value)) {
    assertExactKeys(value, ['edit'], path);
    assertTreeNode(value.edit, `${path}.edit`);
    return { edit: value.edit };
  }
  throw new UnsupportedSemanticsError(`${path} is not a supported merge resolution`);
}

function parseMergeDecision(value: unknown): MergeDecision {
  if (!isRecord(value)) throw new UnsupportedSemanticsError('Merge decisions must be an object');
  assertExactKeys(
    value,
    [
      'conflictResolutions',
      'keepFromSource',
      'keepFromTarget',
      'keepRelationsFromSource',
      'keepRelationsFromTarget',
    ],
    '$.decisions'
  );
  if (!isRecord(value.conflictResolutions)) {
    throw new UnsupportedSemanticsError('$.decisions.conflictResolutions must be an object');
  }
  if (
    typeof value.keepRelationsFromSource !== 'boolean' ||
    typeof value.keepRelationsFromTarget !== 'boolean'
  ) {
    throw new UnsupportedSemanticsError('Merge relation decisions must be booleans');
  }
  const conflictResolutions = Object.fromEntries(
    Object.entries(value.conflictResolutions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, resolution]) => [
        path,
        parseResolution(resolution, `$.decisions.conflictResolutions.${path}`),
      ])
  );
  return {
    conflictResolutions,
    keepFromSource: stringSet(value.keepFromSource, '$.decisions.keepFromSource'),
    keepFromTarget: stringSet(value.keepFromTarget, '$.decisions.keepFromTarget'),
    keepRelationsFromSource: value.keepRelationsFromSource,
    keepRelationsFromTarget: value.keepRelationsFromTarget,
  };
}

function normalizeMergeDecision(value: MergeDecision): MergeDecision {
  const normalized = JSON.parse(
    canonicalizeProtocolValue({
      conflictResolutions: value.conflictResolutions,
      keepFromSource: [...new Set(value.keepFromSource)].sort(),
      keepFromTarget: [...new Set(value.keepFromTarget)].sort(),
      keepRelationsFromSource: value.keepRelationsFromSource,
      keepRelationsFromTarget: value.keepRelationsFromTarget,
    } as ProtocolValue)
  ) as ProtocolValue;
  return parseMergeDecision(normalized);
}

function parseOperation(operations: ProtocolValue[]): MergeDecision {
  if (operations.length !== 1 || !isRecord(operations[0])) {
    throw new UnsupportedSemanticsError(
      'Semantic merge protocol version 1 requires exactly one operation'
    );
  }
  const operation = operations[0];
  assertExactKeys(operation, ['schema', 'decisions'], '$.operations[0]');
  if (operation.schema !== SEMANTIC_MERGE_OPERATION_SCHEMA) {
    throw new UnsupportedSemanticsError(
      `Semantic merge operation must use ${SEMANTIC_MERGE_OPERATION_SCHEMA}`
    );
  }
  return parseMergeDecision(operation.decisions);
}

function validateDecisionAgainstPrepared(prepared: MergeResult, decisions: MergeDecision): void {
  const conflicts = new Set(prepared.conflicts.map((conflict) => conflict.path));
  const resolutions = Object.keys(decisions.conflictResolutions);
  const missing = [...conflicts].filter((path) => !resolutions.includes(path));
  const unknown = resolutions.filter((path) => !conflicts.has(path));
  if (missing.length > 0 || unknown.length > 0) {
    throw new UnsupportedSemanticsError(
      `Merge resolutions do not match conflicts (missing: ${missing.join(', ') || 'none'}; unknown: ${unknown.join(', ') || 'none'})`
    );
  }
  const sourceOnly = new Set(prepared.onlyInSource);
  const targetOnly = new Set(prepared.onlyInTarget);
  if (decisions.keepFromSource.some((path) => !sourceOnly.has(path))) {
    throw new UnsupportedSemanticsError(
      'keepFromSource contains a path not present in source-only'
    );
  }
  if (decisions.keepFromTarget.some((path) => !targetOnly.has(path))) {
    throw new UnsupportedSemanticsError(
      'keepFromTarget contains a path not present in target-only'
    );
  }
}

function resolvedState(inputs: ResolvedInputs, role: string): State {
  const object: ProtocolObject | undefined = inputs.get(role);
  if (object === undefined || object.schema !== STATE_SCHEMA) {
    throw new IntegrityChainInvalidError(`Semantic merge input ${role} did not resolve to a State`);
  }
  return parseState(object);
}

function assertMergeInputs(definition: EffectDefinition, inputs: ResolvedInputs): void {
  const [base, source] = definition.inputs;
  if (
    definition.inputs.length !== 2 ||
    base?.role !== MERGE_BASE_ROLE ||
    source?.role !== MERGE_SOURCE_ROLE ||
    base.object.kind !== 'state' ||
    source.object.kind !== 'state' ||
    inputs.size !== 2 ||
    !inputs.has(MERGE_BASE_ROLE) ||
    !inputs.has(MERGE_SOURCE_ROLE)
  ) {
    throw new UnsupportedSemanticsError(
      'Semantic merge requires exactly merge-base and merge-source State inputs'
    );
  }
}

export const semanticMergeMutationDriver: MutationDriver = Object.freeze({
  ...SEMANTIC_MERGE_MUTATION_DRIVER_REF,
  execute(base: State, definition: EffectDefinition, inputs: ResolvedInputs): State {
    assertMergeInputs(definition, inputs);
    const decisions = parseOperation(definition.operations);
    const baseContent = decodeRepositorySemanticState(resolvedState(inputs, MERGE_BASE_ROLE));
    const sourceContent = decodeRepositorySemanticState(resolvedState(inputs, MERGE_SOURCE_ROLE));
    const targetContent = decodeRepositorySemanticState(base);
    const prepared = prepareMerge(baseContent, sourceContent, targetContent);
    validateDecisionAgainstPrepared(prepared, decisions);
    return createRepositorySemanticState(
      executeMerge(baseContent, sourceContent, targetContent, prepared, decisions)
    );
  },
});

export const semanticMergeMutationDrivers: MutationDriverRegistry = new Map([
  [mutationDriverKey(SEMANTIC_MERGE_MUTATION_DRIVER_REF), semanticMergeMutationDriver],
]);

export interface CreateSemanticMergeEffectInput {
  /** Target ref State and first-parent result. */
  target: State;
  /** Nearest common ancestor State, or the explicit empty semantic State. */
  mergeBase: State;
  /** Source parent State. */
  source: State;
  decisions: MergeDecision;
  expectedTarget?: StateDescriptor;
}

export interface CreatedSemanticMergeEffect {
  effect: Effect;
  result: State;
  prepared: MergeResult;
  content: SemanticContent;
}

/** Build and replay a deterministic, version-pinned, two-parent semantic merge Effect. */
export function createSemanticMergeEffect(
  input: CreateSemanticMergeEffectInput
): CreatedSemanticMergeEffect {
  const target = parseState(input.target);
  const mergeBase = parseState(input.mergeBase);
  const source = parseState(input.source);
  const targetDescriptor = describeProtocolObject(target);
  if (
    input.expectedTarget !== undefined &&
    (targetDescriptor.kind !== input.expectedTarget.kind ||
      targetDescriptor.schema !== input.expectedTarget.schema ||
      targetDescriptor.digest !== input.expectedTarget.digest)
  ) {
    throw new StaleBaseError(
      `Actual target ${targetDescriptor.digest} does not match expected ${input.expectedTarget.digest}`
    );
  }
  const decisions = normalizeMergeDecision(input.decisions);
  const definition: EffectDefinition = {
    driver: { ...SEMANTIC_MERGE_MUTATION_DRIVER_REF },
    operations: [
      {
        schema: SEMANTIC_MERGE_OPERATION_SCHEMA,
        decisions: decisions as unknown as ProtocolValue,
      },
    ],
    inputs: [
      { role: MERGE_BASE_ROLE, object: describeProtocolObject(mergeBase) },
      { role: MERGE_SOURCE_ROLE, object: describeProtocolObject(source) },
    ],
  };
  const result = replay(
    target,
    definition,
    new Map([
      [MERGE_BASE_ROLE, mergeBase],
      [MERGE_SOURCE_ROLE, source],
    ]),
    semanticMergeMutationDrivers
  );
  const effect = parseEffect({
    schema: EFFECT_SCHEMA,
    ...definition,
    base: targetDescriptor,
    result: describeProtocolObject(result),
  });
  const baseContent = decodeRepositorySemanticState(mergeBase);
  const sourceContent = decodeRepositorySemanticState(source);
  const targetContent = decodeRepositorySemanticState(target);
  const prepared = prepareMerge(baseContent, sourceContent, targetContent);
  return {
    effect,
    result,
    prepared,
    content: decodeRepositorySemanticState(result),
  };
}
