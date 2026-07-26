import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalizeEx } from 'json-canonicalize';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COMMIT_V2_SCHEMA,
  CORE_PREDICATE_TYPES,
  DECISION_PREDICATE_TYPE,
  EFFECT_SCHEMA,
  type Effect,
  type EffectDefinition,
  type ExternalStatement,
  PROPOSAL_PREDICATE_TYPE,
  PROTOCOL_CANONICALIZATION,
  PROTOCOL_DIGEST_DOMAIN,
  PROTOCOL_ERROR_CODES,
  PROTOCOL_HASH_ALGORITHM,
  type ProposalStatement,
  PUBLIC_PROTOCOL_NOUNS,
  STATE_SCHEMA,
  STATEMENT_SCHEMA,
  type State,
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
  kind: string;
  schema: string;
  digest: string;
}

interface SemanticVector {
  id: string;
  operation: string;
  input: unknown;
  rule: string;
  expectedCode?: string;
  expected?: string;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as T;
}

const protocolSchema = readJson<Record<string, unknown>>('../../schema/transition-v1.schema.json');
const manifest = readJson<Record<string, unknown>>('../../conformance/v1/manifest.json');
const compatibility = readJson<{
  schema: string;
  mappings: Array<{ source: string; strategy: string; rules: string[] }>;
}>('../../conformance/v1/compatibility.json');
const validVectors = readJson<ValidationVector[]>('../../conformance/v1/vectors/valid.json');
const invalidVectors = readJson<ValidationVector[]>('../../conformance/v1/vectors/invalid.json');
const canonicalVectors = readJson<CanonicalVector[]>('../../conformance/v1/vectors/canonical.json');
const identityVectors = readJson<IdentityVector[]>('../../conformance/v1/vectors/identity.json');
const semanticVectors = readJson<SemanticVector[]>('../../conformance/v1/vectors/semantic.json');

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateProtocolObject = ajv.compile(protocolSchema);

function canonicalize(value: unknown): string {
  const result = canonicalizeEx(value, { undefinedInArrayToNull: false });
  if (result === undefined) throw new Error('RFC 8785 canonicalization produced no bytes');
  return result;
}

function digestIdentityVector(vector: IdentityVector): string {
  const prefix = `${PROTOCOL_DIGEST_DOMAIN}\0${vector.kind}\0${vector.schema}\0`;
  return `${PROTOCOL_HASH_ALGORITHM}:${createHash(PROTOCOL_HASH_ALGORITHM)
    .update(prefix, 'utf8')
    .update(canonicalize(vector.value), 'utf8')
    .digest('hex')}`;
}

function expectUniqueIds(vectors: Array<{ id: string }>): void {
  expect(new Set(vectors.map((vector) => vector.id)).size).toBe(vectors.length);
}

describe('Transition protocol contract', () => {
  it('keeps the compressed public vocabulary and core predicate ownership closed', () => {
    expect(PUBLIC_PROTOCOL_NOUNS).toEqual(['state', 'effect', 'statement', 'commit']);
    expect([STATE_SCHEMA, EFFECT_SCHEMA, STATEMENT_SCHEMA, COMMIT_V2_SCHEMA]).toEqual([
      't3x/state/v1',
      't3x/effect/v1',
      't3x/statement/v1',
      't3x/commit/v2',
    ]);
    expect(CORE_PREDICATE_TYPES).toEqual([PROPOSAL_PREDICATE_TYPE, DECISION_PREDICATE_TYPE]);
    expect(PROTOCOL_CANONICALIZATION).toBe('RFC8785');
  });

  it('keeps representative TypeScript values aligned with the wire vocabulary', () => {
    const state = {
      schema: STATE_SCHEMA,
      codec: { mediaType: 'application/yaml', version: '1' },
      value: {},
    } satisfies State;

    const proposal = {
      schema: STATEMENT_SCHEMA,
      subjects: [
        {
          kind: 'effect',
          schema: EFFECT_SCHEMA,
          digest: `sha256:${'a'.repeat(64)}`,
        },
      ],
      actor: { kind: 'agent', id: 'agent:planner' },
      predicateType: PROPOSAL_PREDICATE_TYPE,
      predicate: {
        intent: { mode: 'inferred', value: 'Rename the device', evidence: [] },
        rationale: { mode: 'unspecified' },
      },
    } satisfies ProposalStatement;

    expect(validateProtocolObject(state)).toBe(true);
    expect(validateProtocolObject(proposal)).toBe(true);
  });

  it('reserves core predicate literals for kernel-owned Statement profiles', () => {
    type CorePredicateImpersonation = ExternalStatement<
      typeof PROPOSAL_PREDICATE_TYPE,
      { forged: true }
    >;

    expectTypeOf<CorePredicateImpersonation>().toEqualTypeOf<never>();
  });

  it('keeps the claimed Result outside the replay definition type', () => {
    type FullEffectFitsReplayDefinition = Effect extends EffectDefinition ? true : false;

    expectTypeOf<FullEffectFitsReplayDefinition>().toEqualTypeOf<false>();
  });

  it('accepts every checked-in valid schema vector', () => {
    expectUniqueIds(validVectors);
    for (const vector of validVectors) {
      const valid = validateProtocolObject(vector.value);
      expect(validateProtocolObject.errors, vector.id).toBeNull();
      expect(valid, vector.id).toBe(true);
    }
  });

  it('rejects every checked-in invalid schema vector', () => {
    expectUniqueIds(invalidVectors);
    for (const vector of invalidVectors) {
      expect(vector.expectedCode).toBe('SCHEMA_INVALID');
      expect(validateProtocolObject(vector.value), vector.id).toBe(false);
    }
  });

  it('pins RFC 8785 canonical bytes, including numeric and non-BMP edges', () => {
    expectUniqueIds(canonicalVectors);
    for (const vector of canonicalVectors) {
      expect(canonicalize(vector.value), vector.id).toBe(vector.canonical);
    }
  });

  it('pins domain-separated object identity without exporting a kernel hasher', () => {
    expectUniqueIds(identityVectors);
    for (const vector of identityVectors) {
      expect(validateProtocolObject(vector.value), vector.id).toBe(true);
      expect(canonicalize(vector.value), vector.id).toBe(vector.canonical);
      expect(digestIdentityVector(vector), vector.id).toBe(vector.digest);
    }

    const proposals = identityVectors.filter((vector) =>
      vector.id.startsWith('proposal-evidence-')
    );
    expect(proposals).toHaveLength(2);
    expect(proposals[0]?.digest).not.toBe(proposals[1]?.digest);

    const states = identityVectors.filter((vector) => vector.id.startsWith('state-'));
    expect(states).toHaveLength(2);
    expect(states[0]?.digest).not.toBe(states[1]?.digest);

    const effects = identityVectors.filter((vector) =>
      vector.id.startsWith('effect-driver-version-')
    );
    expect(effects).toHaveLength(2);
    expect(effects[0]?.digest).not.toBe(effects[1]?.digest);
  });

  it('keeps semantic vectors explicit and within the frozen failure taxonomy', () => {
    expectUniqueIds(semanticVectors);
    const knownErrors = new Set<string>(PROTOCOL_ERROR_CODES);
    for (const vector of semanticVectors) {
      expect(vector.operation.length, vector.id).toBeGreaterThan(0);
      expect(vector.input, vector.id).toBeTypeOf('object');
      expect(vector.rule.length, vector.id).toBeGreaterThan(0);
      expect(Boolean(vector.expectedCode) !== Boolean(vector.expected), vector.id).toBe(true);
      if (vector.expectedCode) expect(knownErrors.has(vector.expectedCode), vector.id).toBe(true);
    }
  });

  it('publishes machine-readable canonical and collection semantics', () => {
    expect(manifest).toMatchObject({
      schema: 't3x/transition-conformance/v1',
      publicNouns: [...PUBLIC_PROTOCOL_NOUNS],
      canonicalization: {
        id: PROTOCOL_CANONICALIZATION,
        valueDomain: 'I-JSON',
        hashAlgorithm: PROTOCOL_HASH_ALGORITHM,
        domain: PROTOCOL_DIGEST_DOMAIN,
      },
      attribution: {
        claims: 'Statement.actor',
        authentication: 'service-layer',
        delegation: 'separate-statement',
      },
    });

    const collections = manifest.collections as Array<{ path: string; semantics: string }>;
    expect(collections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'Effect.operations', semantics: 'ordered' }),
        expect.objectContaining({ path: 'CommitV2.parents', semantics: 'ordered' }),
        expect.objectContaining({ path: 'Statement.subjects', semantics: 'descriptor-set' }),
      ])
    );
  });

  it('freezes compatibility ownership without pretending legacy records are protocol objects', () => {
    expect(compatibility.schema).toBe('t3x/transition-compatibility/v1');
    expect(compatibility.mappings.map((mapping) => mapping.source)).toEqual([
      'CommitV1',
      'SourcedYOp',
      'ExtractionDraft',
      'WorkspaceDraft',
    ]);
    for (const mapping of compatibility.mappings) {
      expect(['coexist', 'compile', 'project']).toContain(mapping.strategy);
      expect(mapping.rules.length, mapping.source).toBeGreaterThan(0);
    }
  });
});
