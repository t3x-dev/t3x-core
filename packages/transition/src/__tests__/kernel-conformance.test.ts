import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeProtocolValue,
  digestProtocolObject,
  type Effect,
  NonCanonicalValueError,
  type ProtocolValue,
  parseEffect,
  parseProtocolBytes,
  parseProtocolObject,
  parseStatement,
  SchemaInvalidError,
} from '..';

interface ValidationVector {
  id: string;
  expectedCode?: string;
  value: unknown;
}

interface CanonicalVector {
  id: string;
  value: unknown;
  canonical: string;
}

interface IdentityVector extends CanonicalVector {
  digest: string;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T;
}

const validVectors = readJson<ValidationVector[]>('../../conformance/v1/vectors/valid.json');
const invalidVectors = readJson<ValidationVector[]>('../../conformance/v1/vectors/invalid.json');
const canonicalVectors = readJson<CanonicalVector[]>('../../conformance/v1/vectors/canonical.json');
const identityVectors = readJson<IdentityVector[]>('../../conformance/v1/vectors/identity.json');

const digestA = `sha256:${'a'.repeat(64)}` as const;
const digestB = `sha256:${'b'.repeat(64)}` as const;

describe('Transition production conformance harness', () => {
  it('strict-parses every valid wire vector through object and byte APIs', () => {
    for (const vector of validVectors) {
      expect(parseProtocolObject(vector.value), vector.id).toEqual(vector.value);
      expect(parseProtocolBytes(JSON.stringify(vector.value)), vector.id).toEqual(vector.value);
    }
  });

  it('rejects every invalid wire vector with SCHEMA_INVALID', () => {
    for (const vector of invalidVectors) {
      expect(vector.expectedCode, vector.id).toBe('SCHEMA_INVALID');
      try {
        parseProtocolObject(vector.value);
        expect.unreachable(`Expected ${vector.id} to fail`);
      } catch (error) {
        expect(error, vector.id).toBeInstanceOf(SchemaInvalidError);
        expect(error, vector.id).toMatchObject({ code: 'SCHEMA_INVALID' });
      }
    }
  });

  it('matches every RFC 8785 canonical vector with an independent implementation', () => {
    for (const vector of canonicalVectors) {
      expect(canonicalizeProtocolValue(vector.value as ProtocolValue), vector.id).toBe(
        vector.canonical
      );
    }
  });

  it('matches every checked-in domain-separated identity vector', () => {
    for (const vector of identityVectors) {
      const object = parseProtocolObject(vector.value);
      expect(canonicalizeProtocolValue(object as unknown as ProtocolValue), vector.id).toBe(
        vector.canonical
      );
      expect(digestProtocolObject(object), vector.id).toBe(vector.digest);
    }
  });

  it('rejects duplicate raw JSON keys before object validation', () => {
    expect(() =>
      parseProtocolBytes('{"schema":"t3x/state/v1","schema":"t3x/state/v1"}')
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });

  it('rejects lone Unicode surrogates before canonicalization', () => {
    expect(() => parseProtocolBytes('"\\ud800"')).toThrowError(NonCanonicalValueError);
  });

  it('rejects JavaScript-only properties that canonical JSON would otherwise hide', () => {
    const array: ProtocolValue[] = [];
    Object.defineProperty(array, 'metadata', { enumerable: true, value: true });
    expect(() => canonicalizeProtocolValue(array)).toThrowError(NonCanonicalValueError);

    const object = { value: true };
    Object.defineProperty(object, 'hidden', { enumerable: false, value: true });
    expect(() => canonicalizeProtocolValue(object)).toThrowError(NonCanonicalValueError);
  });

  it('rejects duplicate and unordered role-keyed Effect inputs', () => {
    const inputA = {
      role: 'alpha',
      object: { kind: 'state', schema: 't3x/state/v1', digest: digestA },
    };
    const inputB = {
      role: 'beta',
      object: { kind: 'state', schema: 't3x/state/v1', digest: digestB },
    };
    const effect = {
      schema: 't3x/effect/v1',
      base: inputA.object,
      driver: {
        protocol: 't3x.dev/test',
        protocolVersion: '1',
        specDigest: digestA,
      },
      operations: [],
      inputs: [inputA, inputB],
      result: inputB.object,
    } satisfies Effect;

    expect(parseEffect(effect)).toEqual(effect);
    expect(() => parseEffect({ ...effect, inputs: [inputB, inputA] })).toThrowError(
      expect.objectContaining({ code: 'NON_CANONICAL_VALUE' })
    );
    expect(() => parseEffect({ ...effect, inputs: [inputA, inputA] })).toThrowError(
      expect.objectContaining({ code: 'NON_CANONICAL_VALUE' })
    );
  });

  it('rejects unordered and duplicate Statement descriptor sets', () => {
    const subjectA = { kind: 'state', schema: 't3x/state/v1', digest: digestA } as const;
    const subjectB = { kind: 'state', schema: 't3x/state/v1', digest: digestB } as const;
    const statement = {
      schema: 't3x/statement/v1',
      subjects: [subjectA, subjectB],
      actor: { kind: 'service', id: 'test:validator' },
      predicateType: 'test.validation/v1',
      predicate: { valid: true },
    };

    expect(parseStatement(statement)).toEqual(statement);
    expect(() => parseStatement({ ...statement, subjects: [subjectB, subjectA] })).toThrowError(
      expect.objectContaining({ code: 'NON_CANONICAL_VALUE' })
    );
    expect(() => parseStatement({ ...statement, subjects: [subjectA, subjectA] })).toThrowError(
      expect.objectContaining({ code: 'NON_CANONICAL_VALUE' })
    );
  });
});
