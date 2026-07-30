import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeProtocolValue,
  type Digest,
  type EffectDefinition,
  type MutationDriver,
  type MutationDriverRegistry,
  mutationDriverKey,
  type ObjectDescriptor,
  type ObjectResolver,
  type ProtocolValue,
  parseCommitV2,
  parseEffect,
  parseObjectDescriptor,
  ReplayPreconditionFailedError,
  type ResolvedInputs,
  resolveProtocolObject,
  SchemaInvalidError,
  type State,
  TransitionProtocolError,
  UnsupportedMediaTypeError,
  UnsupportedSemanticsError,
  verifyCommitIntegrity,
  verifyEffect,
} from '..';

interface FixtureResource {
  descriptor: ObjectDescriptor;
  bytes: string;
}

interface ExecutionExpectation {
  status?: 'verified';
  result?: ObjectDescriptor;
  errorCode?: string;
}

interface ExecutionCase {
  id: string;
  operation: 'resolve' | 'verify_effect' | 'verify_commit';
  drivers: string[];
  subject: ObjectDescriptor;
  objects: FixtureResource[];
  expected: ExecutionExpectation;
}

interface ExecutionCorpus {
  schema: 't3x/transition-execution/v1';
  conformanceDriver: {
    ref: {
      protocol: string;
      protocolVersion: string;
      specDigest: Digest;
    };
    specDigestDomain: string;
    spec: {
      protocol: string;
      protocolVersion: string;
      stateCodec: { mediaType: string; version: string };
      operations: ProtocolValue[];
      ordering: string;
      atomicity: string;
      namedInputs: string;
    };
  };
  cases: ExecutionCase[];
}

const corpus = JSON.parse(
  readFileSync(new URL('../../conformance/v1/vectors/execution.json', import.meta.url), 'utf8')
) as ExecutionCorpus;

const textEncoder = new TextEncoder();

function descriptorKey(descriptor: ObjectDescriptor): string {
  return `${descriptor.kind}\0${descriptor.schema}\0${descriptor.digest}`;
}

class FixtureResolver implements ObjectResolver {
  private readonly objects = new Map<string, Uint8Array>();

  constructor(resources: FixtureResource[]) {
    for (const resource of resources) {
      const descriptor = parseObjectDescriptor(resource.descriptor);
      this.objects.set(descriptorKey(descriptor), textEncoder.encode(resource.bytes));
    }
  }

  async get(descriptor: ObjectDescriptor): Promise<Uint8Array | undefined> {
    const bytes = this.objects.get(descriptorKey(descriptor));
    return bytes === undefined ? undefined : new Uint8Array(bytes);
  }
}

function parseOperation(
  operation: ProtocolValue,
  index: number
): {
  op: 'test' | 'replace';
  value: string;
} {
  if (
    operation === null ||
    typeof operation !== 'object' ||
    Array.isArray(operation) ||
    Object.keys(operation).length !== 2 ||
    typeof operation.value !== 'string' ||
    (operation.op !== 'test' && operation.op !== 'replace')
  ) {
    throw new SchemaInvalidError('Invalid conformance string operation', `$.operations[${index}]`);
  }
  return { op: operation.op, value: operation.value };
}

const conformanceDriver: MutationDriver = Object.freeze({
  ...corpus.conformanceDriver.ref,
  execute(base: State, definition: EffectDefinition, inputs: ResolvedInputs): State {
    if (
      base.codec.mediaType !== corpus.conformanceDriver.spec.stateCodec.mediaType ||
      base.codec.version !== corpus.conformanceDriver.spec.stateCodec.version ||
      typeof base.value !== 'string'
    ) {
      throw new UnsupportedMediaTypeError('Conformance driver requires its declared string codec');
    }
    if (definition.inputs.length !== 0 || inputs.size !== 0) {
      throw new UnsupportedSemanticsError('Conformance driver does not define named inputs');
    }

    let value = base.value;
    for (const [index, rawOperation] of definition.operations.entries()) {
      const operation = parseOperation(rawOperation, index);
      if (operation.op === 'test') {
        if (value !== operation.value) {
          throw new ReplayPreconditionFailedError(
            `Conformance string test failed at operation ${index}`
          );
        }
      } else {
        value = operation.value;
      }
    }
    return {
      schema: 't3x/state/v1',
      codec: { ...base.codec },
      value,
    };
  },
});

const conformanceDrivers: MutationDriverRegistry = new Map([
  [mutationDriverKey(conformanceDriver), conformanceDriver],
]);

function driversFor(vector: ExecutionCase): MutationDriverRegistry {
  if (vector.drivers.length === 0) return new Map();
  if (vector.drivers.length !== 1 || vector.drivers[0] !== 't3x.conformance/string-replace@1') {
    throw new SchemaInvalidError('Execution vector requests an unknown fixture driver');
  }
  return conformanceDrivers;
}

async function execute(vector: ExecutionCase): Promise<ExecutionExpectation> {
  const resolver = new FixtureResolver(vector.objects);
  const subject = parseObjectDescriptor(vector.subject);

  try {
    const object = await resolveProtocolObject(resolver, subject);
    if (vector.operation === 'resolve') return { status: 'verified' };
    if (vector.operation === 'verify_effect') {
      const verified = await verifyEffect(parseEffect(object), {
        resolver,
        drivers: driversFor(vector),
      });
      return { status: 'verified', result: verified.resultDescriptor };
    }
    await verifyCommitIntegrity(parseCommitV2(object), resolver);
    return { status: 'verified' };
  } catch (error) {
    if (!(error instanceof TransitionProtocolError)) throw error;
    return { errorCode: error.code };
  }
}

describe('portable execution corpus', () => {
  it('pins the conformance-only driver spec independently from Effect identity', () => {
    expect(corpus.conformanceDriver.ref).toMatchObject({
      protocol: corpus.conformanceDriver.spec.protocol,
      protocolVersion: corpus.conformanceDriver.spec.protocolVersion,
    });
    const actual = `sha256:${createHash('sha256')
      .update(`${corpus.conformanceDriver.specDigestDomain}\0`, 'utf8')
      .update(
        canonicalizeProtocolValue(corpus.conformanceDriver.spec as unknown as ProtocolValue),
        'utf8'
      )
      .digest('hex')}`;

    expect(actual).toBe(corpus.conformanceDriver.ref.specDigest);
  });

  it('executes every cross-runtime verdict through kernel ports', async () => {
    expect(corpus.schema).toBe('t3x/transition-execution/v1');
    expect(new Set(corpus.cases.map((vector) => vector.id)).size).toBe(corpus.cases.length);

    for (const vector of corpus.cases) {
      expect(await execute(vector), vector.id).toEqual(vector.expected);
    }
  });

  it('keeps the fixture driver test-local rather than exporting product semantics', () => {
    expect(corpus.conformanceDriver.ref.protocol).toBe('t3x.conformance/string-replace');
    expect(corpus.cases.some((vector) => vector.operation === 'verify_effect')).toBe(true);
    expect(corpus.cases.some((vector) => vector.operation === 'verify_commit')).toBe(true);
  });
});
