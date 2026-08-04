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
  ReplayPreconditionFailedError,
  type ResolvedInputs,
  replay,
  SchemaInvalidError,
  StaleBaseError,
  type State,
  type StateDescriptor,
  UnsupportedMediaTypeError,
  UnsupportedSemanticsError,
} from '@t3x-dev/transition';
import {
  applyYOps,
  spec,
  YOPS_ERRORS,
  type YOp,
  YOpSchema,
  type YOpsError,
  type YValue,
} from '@t3x-dev/yops';
import { createYOpsState, yopsStateCodec } from './stateCodec';

export const YOPS_DRIVER_PROTOCOL = 't3x.dev/yops' as const;
export const YOPS_DRIVER_PROTOCOL_VERSION = '1' as const;
const YOPS_SPEC_DIGEST_DOMAIN = 't3x-yops-driver-spec-v1' as const;

function computeYOpsSpecDigest(): Digest {
  const canonicalSpec = canonicalizeProtocolValue(yopsStateCodec.normalize(spec) as ProtocolValue);
  const hex = createHash('sha256')
    .update(`${YOPS_SPEC_DIGEST_DOMAIN}\0`, 'utf8')
    .update(canonicalSpec, 'utf8')
    .digest('hex');
  return `sha256:${hex}`;
}

/** Pins the exact native YOps spec understood by adapter protocol version 1. */
export const YOPS_SPEC_DIGEST = computeYOpsSpecDigest();

export const YOPS_MUTATION_DRIVER_REF: Readonly<MutationDriverRef> = Object.freeze({
  protocol: YOPS_DRIVER_PROTOCOL,
  protocolVersion: YOPS_DRIVER_PROTOCOL_VERSION,
  specDigest: YOPS_SPEC_DIGEST,
});

export class YOpsExecutionError extends Error {
  readonly code = 'YOPS_EXECUTION_FAILED' as const;
  readonly yopsError: YOpsError;

  constructor(error: YOpsError) {
    super(`YOps ${error.code} at operation ${error.op_index}: ${error.message}`);
    this.name = 'YOpsExecutionError';
    this.yopsError = { ...error };
  }
}

class YOpsReplayPreconditionFailedError extends ReplayPreconditionFailedError {
  readonly yopsError: YOpsError;

  constructor(error: YOpsError) {
    const yopsError = { ...error };
    super(`YOps precondition failed at operation ${error.op_index}: ${error.message}`, {
      cause: yopsError,
    });
    this.name = 'YOpsReplayPreconditionFailedError';
    this.yopsError = yopsError;
  }
}

export class YOpsPreconditionFailedError extends StaleBaseError {
  readonly yopsError: YOpsError;

  constructor(error: YOpsReplayPreconditionFailedError) {
    super(error.message, { cause: error });
    this.name = 'YOpsPreconditionFailedError';
    this.yopsError = { ...error.yopsError };
  }
}

function assertYOpsState(state: State): void {
  if (
    state.codec.mediaType !== yopsStateCodec.mediaType ||
    state.codec.version !== yopsStateCodec.version
  ) {
    throw new UnsupportedMediaTypeError(
      `YOps requires State codec ${yopsStateCodec.mediaType}@${yopsStateCodec.version}`
    );
  }
}

function parseOperations(operations: ProtocolValue[]): YOp[] {
  return operations.map((operation, index) => {
    if (
      typeof operation === 'object' &&
      operation !== null &&
      !Array.isArray(operation) &&
      Reflect.ownKeys(operation).includes('source')
    ) {
      throw new SchemaInvalidError(
        'YOps Effect operations cannot carry source metadata; provenance belongs to Statements',
        `$.operations[${index}].source`
      );
    }

    const parsed = YOpSchema.safeParse(operation);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new SchemaInvalidError(
        `Invalid YOps operation: ${issue?.message ?? 'unknown validation error'}`,
        `$.operations[${index}]`
      );
    }
    return parsed.data as YOp;
  });
}

export const yopsMutationDriver: MutationDriver = Object.freeze({
  ...YOPS_MUTATION_DRIVER_REF,
  execute(base: State, definition: EffectDefinition, inputs: ResolvedInputs): State {
    assertYOpsState(base);
    if (definition.inputs.length !== 0 || inputs.size !== 0) {
      throw new UnsupportedSemanticsError(
        'YOps adapter protocol version 1 does not define named input semantics'
      );
    }

    const operations = parseOperations(definition.operations);
    const result = applyYOps(yopsStateCodec.decode(base.value) as YValue, operations);
    if (!result.ok) {
      if (result.error === undefined) {
        throw new IntegrityChainInvalidError('YOps failed without its required native error');
      }
      if (result.error.code === YOPS_ERRORS.ASSERTION_FAILED) {
        throw new YOpsReplayPreconditionFailedError(result.error);
      }
      throw new YOpsExecutionError(result.error);
    }
    return createYOpsState(result.doc);
  },
});

export const yopsMutationDrivers: MutationDriverRegistry = new Map([
  [mutationDriverKey(YOPS_MUTATION_DRIVER_REF), yopsMutationDriver],
]);

export interface CreateYOpsEffectInput {
  base: State;
  operations: readonly ProtocolValue[];
  /** Optional optimistic concurrency check against the caller's observed Base. */
  expectedBase?: StateDescriptor;
}

export interface CreatedYOpsEffect {
  effect: Effect;
  result: State;
}

export interface CreateYOpsReplacementEffectInput {
  base: State;
  target: State;
  /** Optional optimistic concurrency check against the caller's observed Base. */
  expectedBase?: StateDescriptor;
}

function descriptorsEqual(left: StateDescriptor, right: StateDescriptor): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

/**
 * Build one claimed Effect from deterministic replay. Repository-head policy
 * remains outside this adapter; expectedBase is a local compare-and-swap guard.
 */
export function createYOpsEffect(input: CreateYOpsEffectInput): CreatedYOpsEffect {
  const baseDescriptor = describeProtocolObject(input.base);
  if (input.expectedBase !== undefined && !descriptorsEqual(baseDescriptor, input.expectedBase)) {
    throw new StaleBaseError(
      `Actual Base ${baseDescriptor.digest} does not match expected ${input.expectedBase.digest}`
    );
  }

  const operations = JSON.parse(
    canonicalizeProtocolValue(input.operations as ProtocolValue)
  ) as ProtocolValue[];
  const definition: EffectDefinition = {
    driver: { ...YOPS_MUTATION_DRIVER_REF },
    operations,
    inputs: [],
  };
  let result: State;
  try {
    result = replay(input.base, definition, new Map(), yopsMutationDrivers);
  } catch (error) {
    if (error instanceof YOpsReplayPreconditionFailedError) {
      throw new YOpsPreconditionFailedError(error);
    }
    throw error;
  }
  const effect = parseEffect({
    schema: EFFECT_SCHEMA,
    ...definition,
    base: baseDescriptor,
    result: describeProtocolObject(result),
  });
  return { effect, result };
}

function isMapping(value: ProtocolValue): value is Record<string, ProtocolValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameProtocolValue(left: ProtocolValue, right: ProtocolValue): boolean {
  return canonicalizeProtocolValue(left) === canonicalizeProtocolValue(right);
}

/**
 * Build a deterministic, base-sensitive top-level replacement Effect.
 *
 * This is the application adapter for callers that hold an exact target YOps
 * State rather than a user-authored operation list. Assertions bind every
 * changed root to the observed Base, so replay cannot silently apply the
 * replacement to a different State.
 */
export function createYOpsReplacementEffect(
  input: CreateYOpsReplacementEffectInput
): CreatedYOpsEffect {
  assertYOpsState(input.base);
  assertYOpsState(input.target);
  if (!isMapping(input.base.value) || !isMapping(input.target.value)) {
    throw new UnsupportedSemanticsError('YOps replacement requires top-level mapping States');
  }

  const operations: ProtocolValue[] = [];
  const baseKeys = new Set(Object.keys(input.base.value));
  const targetKeys = new Set(Object.keys(input.target.value));
  const keys = [...new Set([...baseKeys, ...targetKeys])].sort();
  for (const key of keys) {
    if (key.length === 0 || key.includes('/')) {
      throw new UnsupportedSemanticsError(
        `YOps replacement cannot address root key ${JSON.stringify(key)}`
      );
    }
    const inBase = baseKeys.has(key);
    const inTarget = targetKeys.has(key);
    const before = input.base.value[key];
    const after = input.target.value[key];
    if (inBase && inTarget && sameProtocolValue(before!, after!)) continue;
    operations.push(
      inBase
        ? { assert: { path: key, equals: before as ProtocolValue } }
        : { assert: { path: key, exists: false } }
    );
    operations.push(
      inTarget ? { set: { path: key, value: after as ProtocolValue } } : { unset: { path: key } }
    );
  }

  const created = createYOpsEffect({
    base: input.base,
    operations,
    ...(input.expectedBase === undefined ? {} : { expectedBase: input.expectedBase }),
  });
  if (
    describeProtocolObject(created.result).digest !== describeProtocolObject(input.target).digest
  ) {
    throw new IntegrityChainInvalidError(
      'YOps replacement did not replay to the exact target State'
    );
  }
  return created;
}
