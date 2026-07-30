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
  type ProtocolValue,
  parseEffect,
  parseState,
  type ResolvedInputs,
  replay,
  STATE_SCHEMA,
  StaleBaseError,
  type State,
  type StateDescriptor,
  UnsupportedSemanticsError,
} from '@t3x-dev/transition';

export const STATE_IMPORT_DRIVER_PROTOCOL = 't3x.dev/state-import' as const;
export const STATE_IMPORT_DRIVER_PROTOCOL_VERSION = '1' as const;
const STATE_IMPORT_DRIVER_SPEC_DIGEST_DOMAIN = 't3x-state-import-driver-spec-v1' as const;
const STATE_IMPORT_ROLE = 'state' as const;

const stateImportDriverSpec: ProtocolValue = {
  protocol: STATE_IMPORT_DRIVER_PROTOCOL,
  protocolVersion: STATE_IMPORT_DRIVER_PROTOCOL_VERSION,
  base: 'state_with_explicit_empty_mapping_value',
  operations: 'none',
  inputs: [
    {
      role: STATE_IMPORT_ROLE,
      kind: 'state',
      cardinality: 'exactly_one',
    },
  ],
  result: 'resolved_state_input_unchanged',
};

function computeStateImportDriverSpecDigest(): Digest {
  const canonicalSpec = canonicalizeProtocolValue(stateImportDriverSpec);
  const hex = createHash('sha256')
    .update(`${STATE_IMPORT_DRIVER_SPEC_DIGEST_DOMAIN}\0`, 'utf8')
    .update(canonicalSpec, 'utf8')
    .digest('hex');
  return `sha256:${hex}`;
}

/** Pins the codec-agnostic State import semantics understood by protocol version 1. */
export const STATE_IMPORT_DRIVER_SPEC_DIGEST = computeStateImportDriverSpecDigest();

export const STATE_IMPORT_MUTATION_DRIVER_REF: Readonly<MutationDriverRef> = Object.freeze({
  protocol: STATE_IMPORT_DRIVER_PROTOCOL,
  protocolVersion: STATE_IMPORT_DRIVER_PROTOCOL_VERSION,
  specDigest: STATE_IMPORT_DRIVER_SPEC_DIGEST,
});

function isExplicitEmptyMapping(value: ProtocolValue): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function assertImportDefinition(definition: EffectDefinition, inputs: ResolvedInputs): void {
  if (definition.operations.length !== 0) {
    throw new UnsupportedSemanticsError(
      'State import adapter protocol version 1 requires zero operations'
    );
  }

  const declaredInput = definition.inputs[0];
  if (
    definition.inputs.length !== 1 ||
    declaredInput?.role !== STATE_IMPORT_ROLE ||
    declaredInput.object.kind !== 'state' ||
    declaredInput.object.schema !== STATE_SCHEMA
  ) {
    throw new UnsupportedSemanticsError(
      'State import adapter protocol version 1 requires exactly one State input with role state'
    );
  }
  if (inputs.size !== 1 || !inputs.has(STATE_IMPORT_ROLE)) {
    throw new IntegrityChainInvalidError(
      'State import replay inputs must contain exactly the declared state role'
    );
  }
}

export const stateImportMutationDriver: MutationDriver = Object.freeze({
  ...STATE_IMPORT_MUTATION_DRIVER_REF,
  execute(base: State, definition: EffectDefinition, inputs: ResolvedInputs): State {
    if (!isExplicitEmptyMapping(base.value)) {
      throw new UnsupportedSemanticsError(
        'State import requires a Base with an explicit empty mapping value'
      );
    }
    assertImportDefinition(definition, inputs);

    const imported = inputs.get(STATE_IMPORT_ROLE);
    if (imported === undefined || imported.schema !== STATE_SCHEMA) {
      throw new IntegrityChainInvalidError('State import input did not resolve to a State');
    }
    return parseState(imported);
  },
});

export const stateImportMutationDrivers: MutationDriverRegistry = new Map([
  [mutationDriverKey(STATE_IMPORT_MUTATION_DRIVER_REF), stateImportMutationDriver],
]);

export interface CreateStateImportEffectInput {
  base: State;
  imported: State;
  /** Optional optimistic concurrency check against the caller's observed Base. */
  expectedBase?: StateDescriptor;
}

export interface CreatedStateImportEffect {
  effect: Effect;
  result: State;
}

function descriptorsEqual(left: StateDescriptor, right: StateDescriptor): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

/**
 * Bind one already-materialized State into the Transition graph without
 * reading external resources or manufacturing provenance inside the Effect.
 */
export function createStateImportEffect(
  input: CreateStateImportEffectInput
): CreatedStateImportEffect {
  const base = parseState(input.base);
  const imported = parseState(input.imported);
  const baseDescriptor = describeProtocolObject(base);
  if (input.expectedBase !== undefined && !descriptorsEqual(baseDescriptor, input.expectedBase)) {
    throw new StaleBaseError(
      `Actual Base ${baseDescriptor.digest} does not match expected ${input.expectedBase.digest}`
    );
  }

  const definition: EffectDefinition = {
    driver: { ...STATE_IMPORT_MUTATION_DRIVER_REF },
    operations: [],
    inputs: [{ role: STATE_IMPORT_ROLE, object: describeProtocolObject(imported) }],
  };
  const result = replay(
    base,
    definition,
    new Map([[STATE_IMPORT_ROLE, imported]]),
    stateImportMutationDrivers
  );
  const effect = parseEffect({
    schema: EFFECT_SCHEMA,
    ...definition,
    base: baseDescriptor,
    result: describeProtocolObject(result),
  });
  return { effect, result };
}
