import { createHash } from 'node:crypto';
import {
  type CreateSemanticMergeEffectInput,
  createSemanticMergeEffect,
  createYOpsState,
  decodeRepositorySemanticState,
  SEMANTIC_MERGE_MUTATION_DRIVER_REF,
  YOPS_MUTATION_DRIVER_REF,
} from '@t3x-dev/core';
import {
  canonicalizeProtocolValue,
  describeProtocolObject,
  EFFECT_SCHEMA,
  type EffectDefinition,
  type MutationDriver,
  mutationDriverKey,
  type ProtocolValue,
  parseEffect,
  type ResolvedInputs,
  replay,
  type State,
  UnsupportedSemanticsError,
} from '@t3x-dev/transition';
import {
  compileSchemaContentMigration,
  type SchemaContentMigrationCommand,
} from '../schema-authoring/content-migration';
import type { DraftDocument } from '../workspace-authoring/types';

const operationSchema = 't3x.application/reviewed-semantic-merge/v1';
const spec: ProtocolValue = {
  protocol: 't3x.dev/reviewed-semantic-merge',
  protocolVersion: '1',
  merge: SEMANTIC_MERGE_MUTATION_DRIVER_REF,
  nativeOperations: YOPS_MUTATION_DRIVER_REF,
  migration: 'schema-content-migration@1',
  operationSchema,
  inputs: ['merge-base', 'merge-source'],
  scope: 'semantic-content-only',
};
export const REVIEWED_MERGE_DRIVER_REF = Object.freeze({
  protocol: 't3x.dev/reviewed-semantic-merge',
  protocolVersion: '1',
  specDigest:
    `sha256:${createHash('sha256').update(canonicalizeProtocolValue(spec)).digest('hex')}` as const,
});
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function commands(value: unknown): SchemaContentMigrationCommand[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new UnsupportedSemanticsError('Invalid merge migration commands.');
  for (const command of value) {
    if (!isRecord(command)) throw new UnsupportedSemanticsError('Invalid merge migration command.');
    const keys =
      command.kind === 'move'
        ? ['kind', 'from', 'to']
        : command.kind === 'rename_node'
          ? ['kind', 'path', 'toKey']
          : command.kind === 'remove'
            ? ['kind', 'path']
            : ['kind', 'path', 'value'];
    if (
      !['set', 'append', 'remove', 'move', 'rename_node'].includes(String(command.kind)) ||
      Object.keys(command).sort().join(',') !== keys.sort().join(',') ||
      (command.kind === 'move'
        ? typeof command.from !== 'string' || typeof command.to !== 'string'
        : typeof command.path !== 'string') ||
      (command.kind === 'rename_node' && typeof command.toKey !== 'string')
    )
      throw new UnsupportedSemanticsError('Invalid merge migration command.');
  }
  return value as SchemaContentMigrationCommand[];
}

/** One-way application adapter over native semantic merge and native content operations.
 * Keeps the source parent's Result in Effect.inputs; no protocol or v1 driver changes. */
export const reviewedMergeMutationDriver: MutationDriver = Object.freeze({
  ...REVIEWED_MERGE_DRIVER_REF,
  execute(target: State, definition: EffectDefinition, inputs: ResolvedInputs) {
    const operation = definition.operations[0];
    if (
      definition.operations.length !== 1 ||
      !isRecord(operation) ||
      operation.schema !== operationSchema ||
      Object.keys(operation).sort().join(',') !==
        ['schema', 'decisions', 'rootKey', 'commands'].sort().join(',') ||
      typeof operation.rootKey !== 'string' ||
      !/^[a-z][a-z0-9_]*$/.test(operation.rootKey) ||
      definition.inputs.length !== 2 ||
      inputs.size !== 2
    )
      throw new UnsupportedSemanticsError('Invalid reviewed merge operation or inputs.');
    const base = inputs.get('merge-base');
    const source = inputs.get('merge-source');
    if (base?.schema !== 't3x/state/v1' || source?.schema !== 't3x/state/v1')
      throw new UnsupportedSemanticsError('Reviewed merge requires both exact State inputs.');
    const merged = createSemanticMergeEffect({
      target,
      mergeBase: base as State,
      source: source as State,
      decisions: operation.decisions as unknown as CreateSemanticMergeEffectInput['decisions'],
    });
    // Replay itself validates the immutable input descriptors before this adapter executes.
    return createYOpsState(
      compileSchemaContentMigration(
        merged.result.value as DraftDocument,
        operation.rootKey,
        commands(operation.commands)
      ).document
    );
  },
});
export const reviewedMergeMutationDrivers = new Map([
  [mutationDriverKey(REVIEWED_MERGE_DRIVER_REF), reviewedMergeMutationDriver],
]);

export function createReviewedSemanticMergeEffect(
  input: CreateSemanticMergeEffectInput & {
    rootKey: string;
    commands: readonly SchemaContentMigrationCommand[];
  }
) {
  const merged = createSemanticMergeEffect(input);
  const definition: EffectDefinition = {
    driver: { ...REVIEWED_MERGE_DRIVER_REF },
    inputs: merged.effect.inputs,
    operations: JSON.parse(
      canonicalizeProtocolValue([
        {
          schema: operationSchema,
          decisions: (merged.effect.operations[0] as Record<string, ProtocolValue>).decisions!,
          rootKey: input.rootKey,
          commands: input.commands as unknown as ProtocolValue,
        },
      ])
    ),
  };
  const result = replay(
    input.target,
    definition,
    new Map([
      ['merge-base', input.mergeBase],
      ['merge-source', input.source],
    ]),
    reviewedMergeMutationDrivers
  );
  return {
    ...merged,
    result,
    content: decodeRepositorySemanticState(result),
    effect: parseEffect({
      schema: EFFECT_SCHEMA,
      ...definition,
      base: describeProtocolObject(input.target),
      result: describeProtocolObject(result),
    }),
  };
}
