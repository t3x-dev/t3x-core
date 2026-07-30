import { createHash } from 'node:crypto';
import {
  canonicalizeProtocolValue,
  type Digest,
  describeProtocolObject,
  EFFECT_SCHEMA,
  type Effect,
  type EffectDefinition,
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
import { isScalar, parseDocument, Scalar } from 'yaml';
import { z } from 'zod';
import { createYamlSourceState, yamlSourceStateCodec } from './yamlSourceStateCodec';

export const YAML_SOURCE_DRIVER_PROTOCOL = 't3x.dev/yaml-source-edit' as const;
export const YAML_SOURCE_DRIVER_PROTOCOL_VERSION = '1' as const;
const YAML_SOURCE_DRIVER_SPEC_DIGEST_DOMAIN = 't3x-yaml-source-edit-driver-spec-v1' as const;

const PathSegmentSchema = z.union([z.string().min(1), z.number().int().nonnegative()]);
const ReplaceScalarOperationSchema = z
  .object({
    op: z.literal('replace_scalar'),
    path: z.array(PathSegmentSchema).min(1),
    expect: z.string(),
    value: z.string(),
  })
  .strict();

export interface YamlSourceReplaceScalarOperation {
  op: 'replace_scalar';
  path: Array<string | number>;
  expect: string;
  value: string;
}

const yamlSourceDriverSpec: ProtocolValue = {
  protocol: YAML_SOURCE_DRIVER_PROTOCOL,
  protocolVersion: YAML_SOURCE_DRIVER_PROTOCOL_VERSION,
  stateCodec: {
    mediaType: yamlSourceStateCodec.mediaType,
    version: yamlSourceStateCodec.version,
  },
  documentProfile: {
    documents: 'exactly_one',
    yamlVersion: '1.2',
    duplicateKeys: 'rejected',
    unknownTags: 'opaque',
    externalReferences: 'unresolved',
  },
  operations: [
    {
      op: 'replace_scalar',
      target: 'untagged_unanchored_plain_string_scalar',
      path: 'non_empty_string_or_non_negative_integer_segments',
      precondition: 'decoded_value_equals_expect',
      replacement: 'localized_source_range_splice',
      replacementValue: {
        lexicalPattern: '^[A-Za-z_][A-Za-z0-9_.-]*$',
        parsedType: 'yaml_1.2_plain_string_with_same_value',
      },
    },
  ],
  ordering: 'listed',
  atomicity: 'all_or_no_result',
  namedInputs: 'unsupported',
};

function computeYamlSourceDriverSpecDigest(): Digest {
  const canonicalSpec = canonicalizeProtocolValue(yamlSourceDriverSpec);
  const hex = createHash('sha256')
    .update(`${YAML_SOURCE_DRIVER_SPEC_DIGEST_DOMAIN}\0`, 'utf8')
    .update(canonicalSpec, 'utf8')
    .digest('hex');
  return `sha256:${hex}`;
}

/** Pins the exact source-edit semantics understood by adapter protocol version 1. */
export const YAML_SOURCE_DRIVER_SPEC_DIGEST = computeYamlSourceDriverSpecDigest();

export const YAML_SOURCE_MUTATION_DRIVER_REF: Readonly<MutationDriverRef> = Object.freeze({
  protocol: YAML_SOURCE_DRIVER_PROTOCOL,
  protocolVersion: YAML_SOURCE_DRIVER_PROTOCOL_VERSION,
  specDigest: YAML_SOURCE_DRIVER_SPEC_DIGEST,
});

interface ReplayPreconditionDetails {
  operationIndex: number;
  path: Array<string | number>;
  reason: 'path_not_found' | 'expected_value_mismatch';
}

class YamlSourceReplayPreconditionFailedError extends ReplayPreconditionFailedError {
  readonly details: ReplayPreconditionDetails;

  constructor(details: ReplayPreconditionDetails) {
    super(`YAML source edit precondition failed at operation ${details.operationIndex}`, {
      cause: details,
    });
    this.name = 'YamlSourceReplayPreconditionFailedError';
    this.details = {
      ...details,
      path: [...details.path],
    };
  }
}

export class YamlSourcePreconditionFailedError extends StaleBaseError {
  readonly details: ReplayPreconditionDetails;

  constructor(error: YamlSourceReplayPreconditionFailedError) {
    super(error.message, { cause: error });
    this.name = 'YamlSourcePreconditionFailedError';
    this.details = {
      ...error.details,
      path: [...error.details.path],
    };
  }
}

function assertYamlSourceState(state: State): void {
  if (
    state.codec.mediaType !== yamlSourceStateCodec.mediaType ||
    state.codec.version !== yamlSourceStateCodec.version
  ) {
    throw new UnsupportedMediaTypeError(
      `YAML source edit requires State codec ${yamlSourceStateCodec.mediaType}@${yamlSourceStateCodec.version}`
    );
  }
}

function parseOperations(operations: ProtocolValue[]): YamlSourceReplaceScalarOperation[] {
  return operations.map((operation, index) => {
    const parsed = ReplaceScalarOperationSchema.safeParse(operation);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new SchemaInvalidError(
        `Invalid YAML source edit operation: ${issue?.message ?? 'unknown validation error'}`,
        `$.operations[${index}]`
      );
    }
    return parsed.data;
  });
}

function parseSourceDocument(source: string): ReturnType<typeof parseDocument> {
  const document = parseDocument(source, {
    keepSourceTokens: true,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });
  const error = document.errors[0];
  if (error !== undefined) {
    throw new UnsupportedSemanticsError(
      `YAML source edit requires one syntactically valid document (${error.code})`
    );
  }
  const warning = document.warnings.find((candidate) => candidate.code !== 'TAG_RESOLVE_FAILED');
  if (warning !== undefined) {
    throw new UnsupportedSemanticsError(
      `YAML source edit does not support this document profile (${warning.code})`
    );
  }
  return document;
}

function operationPath(path: Array<string | number>): string {
  return path
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : JSON.stringify(segment)))
    .join('.');
}

function assertReplacementLiteral(value: string, operationIndex: number): void {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)) {
    throw new UnsupportedSemanticsError(
      `YAML source edit operation ${operationIndex} requires a portable plain-string replacement`
    );
  }

  const probe = parseDocument(`value: ${value}\n`, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: '1.2',
  });
  const node = probe.getIn(['value'], true);
  if (
    probe.errors.length > 0 ||
    probe.warnings.length > 0 ||
    !isScalar(node) ||
    node.type !== Scalar.PLAIN ||
    typeof node.value !== 'string' ||
    node.value !== value
  ) {
    throw new UnsupportedSemanticsError(
      `YAML source edit operation ${operationIndex} replacement is not a YAML 1.2 plain string`
    );
  }
}

interface EditableScalar {
  start: number;
  end: number;
}

function locateEditableScalar(
  source: string,
  operation: YamlSourceReplaceScalarOperation,
  operationIndex: number
): EditableScalar {
  const document = parseSourceDocument(source);
  const node = document.getIn(operation.path, true);
  if (node === undefined) {
    throw new YamlSourceReplayPreconditionFailedError({
      operationIndex,
      path: operation.path,
      reason: 'path_not_found',
    });
  }
  if (
    !isScalar(node) ||
    node.type !== Scalar.PLAIN ||
    node.tag !== undefined ||
    node.anchor !== undefined ||
    typeof node.value !== 'string' ||
    node.range == null
  ) {
    throw new UnsupportedSemanticsError(
      `YAML source edit operation ${operationIndex} target ${operationPath(operation.path)} is not an untagged, unanchored plain string scalar`
    );
  }
  if (node.value !== operation.expect) {
    throw new YamlSourceReplayPreconditionFailedError({
      operationIndex,
      path: operation.path,
      reason: 'expected_value_mismatch',
    });
  }

  const [start, end] = node.range;
  if (source.slice(start, end) !== node.source) {
    throw new UnsupportedSemanticsError(
      `YAML source edit operation ${operationIndex} target range is not source-addressable`
    );
  }
  return { start, end };
}

function replaceScalar(
  source: string,
  operation: YamlSourceReplaceScalarOperation,
  operationIndex: number
): string {
  assertReplacementLiteral(operation.value, operationIndex);
  const { start, end } = locateEditableScalar(source, operation, operationIndex);
  const result = `${source.slice(0, start)}${operation.value}${source.slice(end)}`;

  const reparsed = parseSourceDocument(result).getIn(operation.path, true);
  if (
    !isScalar(reparsed) ||
    reparsed.type !== Scalar.PLAIN ||
    reparsed.tag !== undefined ||
    reparsed.anchor !== undefined ||
    reparsed.value !== operation.value
  ) {
    throw new UnsupportedSemanticsError(
      `YAML source edit operation ${operationIndex} did not produce the declared scalar`
    );
  }
  return result;
}

export const yamlSourceMutationDriver: MutationDriver = Object.freeze({
  ...YAML_SOURCE_MUTATION_DRIVER_REF,
  execute(base: State, definition: EffectDefinition, inputs: ResolvedInputs): State {
    assertYamlSourceState(base);
    if (definition.inputs.length !== 0 || inputs.size !== 0) {
      throw new UnsupportedSemanticsError(
        'YAML source edit adapter protocol version 1 does not define named input semantics'
      );
    }

    const operations = parseOperations(definition.operations);
    let source = yamlSourceStateCodec.decode(base.value) as string;
    for (const [index, operation] of operations.entries()) {
      source = replaceScalar(source, operation, index);
    }
    return createYamlSourceState(source);
  },
});

export const yamlSourceMutationDrivers: MutationDriverRegistry = new Map([
  [mutationDriverKey(YAML_SOURCE_MUTATION_DRIVER_REF), yamlSourceMutationDriver],
]);

export interface CreateYamlSourceEffectInput {
  base: State;
  operations: readonly ProtocolValue[];
  /** Optional optimistic concurrency check against the caller's observed Base. */
  expectedBase?: StateDescriptor;
}

export interface CreatedYamlSourceEffect {
  effect: Effect;
  result: State;
}

function descriptorsEqual(left: StateDescriptor, right: StateDescriptor): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

/** Build one source-preserving Effect from deterministic localized replay. */
export function createYamlSourceEffect(
  input: CreateYamlSourceEffectInput
): CreatedYamlSourceEffect {
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
    driver: { ...YAML_SOURCE_MUTATION_DRIVER_REF },
    operations,
    inputs: [],
  };
  let result: State;
  try {
    result = replay(input.base, definition, new Map(), yamlSourceMutationDrivers);
  } catch (error) {
    if (error instanceof YamlSourceReplayPreconditionFailedError) {
      throw new YamlSourcePreconditionFailedError(error);
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
