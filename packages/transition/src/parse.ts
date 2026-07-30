import { canonicalizeProtocolValue, compareCanonicalValues } from './canonical';
import {
  COMMIT_V2_SCHEMA,
  type CommitDescriptor,
  type CommitV2,
  DECISION_PREDICATE_TYPE,
  type DecisionPredicate,
  type DecisionStatement,
  EFFECT_SCHEMA,
  type Effect,
  type EffectDefinition,
  type EffectDescriptor,
  type EvidenceRef,
  type ObjectDescriptor,
  PROPOSAL_PREDICATE_TYPE,
  type ProposalPredicate,
  type ProposalStatement,
  type ProtocolObject,
  type ProtocolValue,
  STATE_SCHEMA,
  STATEMENT_SCHEMA,
  type State,
  type StateDescriptor,
  type Statement,
  type StatementDescriptor,
  type StringClaim,
} from './contracts';
import { NonCanonicalValueError, SchemaInvalidError } from './errors';
import { parseProtocolJson } from './json';

type UnknownRecord = Record<string, unknown>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN =
  /^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])T([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;

function schemaError(message: string, path: string): never {
  throw new SchemaInvalidError(message, path);
}

function assertProtocolDomain(value: unknown): void {
  canonicalizeProtocolValue(value as ProtocolValue);
}

function closedRecord(
  value: unknown,
  path: string,
  required: readonly string[],
  allowed: readonly string[] = required
): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return schemaError('Expected an object', path);
  }

  const record = value as UnknownRecord;
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) schemaError(`Unknown field ${JSON.stringify(key)}`, path);
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key))
      schemaError(`Missing required field ${JSON.stringify(key)}`, path);
  }
  return record;
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return schemaError('Expected an array', path);
  return value;
}

function stringValue(
  value: unknown,
  path: string,
  options: { min?: number; max?: number; pattern?: RegExp } = {}
): string {
  if (typeof value !== 'string') return schemaError('Expected a string', path);
  const codePointLength = [...value].length;
  if (codePointLength < (options.min ?? 0)) schemaError('String is too short', path);
  if (codePointLength > (options.max ?? Number.POSITIVE_INFINITY)) {
    schemaError('String is too long', path);
  }
  if (options.pattern !== undefined && !options.pattern.test(value)) {
    schemaError('String does not match the required format', path);
  }
  return value;
}

function literal<T extends string>(value: unknown, expected: T, path: string): T {
  if (value !== expected) return schemaError(`Expected ${JSON.stringify(expected)}`, path);
  return expected;
}

function identifier(value: unknown, path: string): string {
  return stringValue(value, path, { min: 1, max: 256, pattern: IDENTIFIER_PATTERN });
}

function digest(value: unknown, path: string): void {
  stringValue(value, path, { pattern: DIGEST_PATTERN });
}

function canonicalSet(values: readonly unknown[], path: string): void {
  for (let index = 1; index < values.length; index += 1) {
    const comparison = compareCanonicalValues(
      values[index - 1] as ProtocolValue,
      values[index] as ProtocolValue
    );
    if (comparison === 0) {
      throw new NonCanonicalValueError('Canonical set contains a duplicate member', path);
    }
    if (comparison > 0) {
      throw new NonCanonicalValueError('Canonical set members are not in ascending order', path);
    }
  }
}

function resourceDescriptor(value: unknown, path: string): void {
  const record = closedRecord(value, path, ['uri', 'mediaType', 'digest']);
  stringValue(record.uri, `${path}.uri`, { min: 1, max: 2048 });
  stringValue(record.mediaType, `${path}.mediaType`, { min: 1, max: 256 });
  digest(record.digest, `${path}.digest`);
}

function descriptorSchema(kind: string): string {
  switch (kind) {
    case 'state':
      return STATE_SCHEMA;
    case 'effect':
      return EFFECT_SCHEMA;
    case 'statement':
      return STATEMENT_SCHEMA;
    case 'commit':
      return COMMIT_V2_SCHEMA;
    default:
      return schemaError('Unknown protocol object kind', '$.kind');
  }
}

export function parseObjectDescriptor(value: unknown, path = '$'): ObjectDescriptor {
  assertProtocolDomain(value);
  const record = closedRecord(value, path, ['kind', 'schema', 'digest']);
  const kind = stringValue(record.kind, `${path}.kind`);
  literal(record.schema, descriptorSchema(kind), `${path}.schema`);
  digest(record.digest, `${path}.digest`);
  return value as ObjectDescriptor;
}

function descriptorOfKind<K extends ObjectDescriptor['kind']>(
  value: unknown,
  kind: K,
  path: string
): Extract<ObjectDescriptor, { kind: K }> {
  const descriptor = parseObjectDescriptor(value, path);
  if (descriptor.kind !== kind) schemaError(`Expected a ${kind} descriptor`, path);
  return descriptor as Extract<ObjectDescriptor, { kind: K }>;
}

function actorRef(value: unknown, path: string): void {
  const record = closedRecord(value, path, ['kind', 'id']);
  if (record.kind !== 'human' && record.kind !== 'agent' && record.kind !== 'service') {
    schemaError('Actor kind must be human, agent, or service', `${path}.kind`);
  }
  stringValue(record.id, `${path}.id`, { min: 1, max: 512 });
}

function evidenceRef(value: unknown, path: string): EvidenceRef {
  const record = closedRecord(value, path, ['resource', 'locator']);
  resourceDescriptor(record.resource, `${path}.resource`);
  const locator = closedRecord(record.locator, `${path}.locator`, ['scheme', 'value']);
  identifier(locator.scheme, `${path}.locator.scheme`);
  assertProtocolDomain(locator.value);
  return value as EvidenceRef;
}

function evidenceSet(value: unknown, path: string, requireMember: boolean): EvidenceRef[] {
  const values = arrayValue(value, path);
  if (requireMember && values.length === 0) schemaError('Stated claims require evidence', path);
  const parsed = values.map((member, index) => evidenceRef(member, `${path}[${index}]`));
  canonicalSet(parsed, path);
  return parsed;
}

function stringClaim(value: unknown, path: string): StringClaim {
  const modeRecord = closedRecord(value, path, ['mode'], ['mode', 'value', 'evidence']);
  const mode = stringValue(modeRecord.mode, `${path}.mode`);

  if (mode === 'unspecified') {
    closedRecord(value, path, ['mode']);
    return value as StringClaim;
  }
  if (mode !== 'stated' && mode !== 'inferred' && mode !== 'authored') {
    return schemaError('Unknown Claim mode', `${path}.mode`);
  }

  const record = closedRecord(value, path, ['mode', 'value', 'evidence']);
  stringValue(record.value, `${path}.value`, { min: 1 });
  evidenceSet(record.evidence, `${path}.evidence`, mode === 'stated');
  return value as StringClaim;
}

function proposalPredicate(value: unknown, path: string): ProposalPredicate {
  const record = closedRecord(value, path, ['intent', 'rationale']);
  stringClaim(record.intent, `${path}.intent`);
  stringClaim(record.rationale, `${path}.rationale`);
  return value as ProposalPredicate;
}

function decisionPolicy(value: unknown, path: string): void {
  const record = closedRecord(value, path, ['mode'], ['mode', 'resource']);
  if (record.mode === 'not_evaluated') {
    closedRecord(value, path, ['mode']);
    return;
  }
  if (record.mode === 'evaluated') {
    const evaluated = closedRecord(value, path, ['mode', 'resource']);
    resourceDescriptor(evaluated.resource, `${path}.resource`);
    return;
  }
  schemaError('Unknown Decision policy mode', `${path}.mode`);
}

function decisionPredicate(value: unknown, path: string): DecisionPredicate {
  const record = closedRecord(value, path, [
    'policy',
    'considered',
    'outcome',
    'rationale',
    'decidedAt',
  ]);
  decisionPolicy(record.policy, `${path}.policy`);
  const considered = arrayValue(record.considered, `${path}.considered`).map((member, index) =>
    descriptorOfKind(member, 'statement', `${path}.considered[${index}]`)
  );
  canonicalSet(considered, `${path}.considered`);

  if (
    record.outcome !== 'accepted' &&
    record.outcome !== 'overridden' &&
    record.outcome !== 'rejected'
  ) {
    schemaError('Unknown Decision outcome', `${path}.outcome`);
  }
  const rationale = stringClaim(record.rationale, `${path}.rationale`);
  if (record.outcome === 'overridden' && rationale.mode !== 'authored') {
    schemaError('Overridden Decisions require an authored rationale', `${path}.rationale`);
  }
  stringValue(record.decidedAt, `${path}.decidedAt`, { pattern: TIMESTAMP_PATTERN });
  return value as DecisionPredicate;
}

function stateCodecRef(value: unknown, path: string): void {
  const record = closedRecord(value, path, ['mediaType', 'version']);
  stringValue(record.mediaType, `${path}.mediaType`, { min: 1, max: 256 });
  identifier(record.version, `${path}.version`);
}

function mutationDriverRef(value: unknown, path: string): void {
  const record = closedRecord(value, path, ['protocol', 'protocolVersion', 'specDigest']);
  identifier(record.protocol, `${path}.protocol`);
  identifier(record.protocolVersion, `${path}.protocolVersion`);
  digest(record.specDigest, `${path}.specDigest`);
}

export function parseState(value: unknown): State {
  assertProtocolDomain(value);
  const record = closedRecord(value, '$', ['schema', 'codec', 'value']);
  literal(record.schema, STATE_SCHEMA, '$.schema');
  stateCodecRef(record.codec, '$.codec');
  assertProtocolDomain(record.value);
  return value as State;
}

export function parseEffectDefinition(value: unknown): EffectDefinition {
  assertProtocolDomain(value);
  const record = closedRecord(value, '$', ['driver', 'operations', 'inputs']);
  mutationDriverRef(record.driver, '$.driver');
  for (const [index, operation] of arrayValue(record.operations, '$.operations').entries()) {
    assertProtocolDomain(operation);
    canonicalizeProtocolValue(operation as ProtocolValue);
    if (!(index in (record.operations as unknown[]))) {
      throw new NonCanonicalValueError('Sparse operation arrays are not canonical', '$.operations');
    }
  }

  const inputs = arrayValue(record.inputs, '$.inputs');
  let previousRole: string | undefined;
  for (const [index, input] of inputs.entries()) {
    const inputRecord = closedRecord(input, `$.inputs[${index}]`, ['role', 'object']);
    const role = identifier(inputRecord.role, `$.inputs[${index}].role`);
    parseObjectDescriptor(inputRecord.object, `$.inputs[${index}].object`);
    if (previousRole !== undefined && previousRole >= role) {
      const message = previousRole === role ? 'Effect input roles must be unique' : 'Effect inputs';
      throw new NonCanonicalValueError(
        message === 'Effect inputs' ? 'Effect inputs are not ordered by role' : message,
        '$.inputs'
      );
    }
    previousRole = role;
  }
  return value as EffectDefinition;
}

export function parseEffect(value: unknown): Effect {
  assertProtocolDomain(value);
  const record = closedRecord(value, '$', [
    'schema',
    'base',
    'driver',
    'operations',
    'inputs',
    'result',
  ]);
  literal(record.schema, EFFECT_SCHEMA, '$.schema');
  descriptorOfKind(record.base, 'state', '$.base');
  parseEffectDefinition({
    driver: record.driver,
    operations: record.operations,
    inputs: record.inputs,
  });
  descriptorOfKind(record.result, 'state', '$.result');
  return value as Effect;
}

export function parseStatement(value: unknown): Statement {
  assertProtocolDomain(value);
  const record = closedRecord(value, '$', [
    'schema',
    'subjects',
    'actor',
    'predicateType',
    'predicate',
  ]);
  literal(record.schema, STATEMENT_SCHEMA, '$.schema');
  const subjects = arrayValue(record.subjects, '$.subjects');
  if (subjects.length === 0) schemaError('Statements require at least one subject', '$.subjects');
  const parsedSubjects = subjects.map((subject, index) =>
    parseObjectDescriptor(subject, `$.subjects[${index}]`)
  );
  canonicalSet(parsedSubjects, '$.subjects');
  actorRef(record.actor, '$.actor');
  const predicateType = identifier(record.predicateType, '$.predicateType');

  if (predicateType === PROPOSAL_PREDICATE_TYPE) {
    if (parsedSubjects.length !== 1 || parsedSubjects[0]?.kind !== 'effect') {
      schemaError('Proposal must subject exactly one Effect', '$.subjects');
    }
    proposalPredicate(record.predicate, '$.predicate');
  } else if (predicateType === DECISION_PREDICATE_TYPE) {
    if (parsedSubjects.length !== 1 || parsedSubjects[0]?.kind !== 'statement') {
      schemaError('Decision must subject exactly one Proposal descriptor', '$.subjects');
    }
    decisionPredicate(record.predicate, '$.predicate');
  } else {
    assertProtocolDomain(record.predicate);
  }
  return value as Statement;
}

export function parseProposalStatement(value: unknown): ProposalStatement {
  const statement = parseStatement(value);
  if (statement.predicateType !== PROPOSAL_PREDICATE_TYPE) {
    schemaError('Expected a Proposal Statement', '$.predicateType');
  }
  return statement as unknown as ProposalStatement;
}

export function parseDecisionStatement(value: unknown): DecisionStatement {
  const statement = parseStatement(value);
  if (statement.predicateType !== DECISION_PREDICATE_TYPE) {
    schemaError('Expected a Decision Statement', '$.predicateType');
  }
  return statement as unknown as DecisionStatement;
}

export function parseCommitV2(value: unknown): CommitV2 {
  assertProtocolDomain(value);
  const record = closedRecord(value, '$', ['schema', 'parents', 'decision', 'result']);
  literal(record.schema, COMMIT_V2_SCHEMA, '$.schema');
  for (const [index, parent] of arrayValue(record.parents, '$.parents').entries()) {
    descriptorOfKind(parent, 'commit', `$.parents[${index}]`);
  }
  descriptorOfKind(record.decision, 'statement', '$.decision');
  descriptorOfKind(record.result, 'state', '$.result');
  return value as CommitV2;
}

export function parseProtocolObject(value: unknown): ProtocolObject {
  assertProtocolDomain(value);
  const record = closedRecord(
    value,
    '$',
    ['schema'],
    [
      'schema',
      'codec',
      'value',
      'base',
      'driver',
      'operations',
      'inputs',
      'result',
      'subjects',
      'actor',
      'predicateType',
      'predicate',
      'parents',
      'decision',
    ]
  );
  switch (record.schema) {
    case STATE_SCHEMA:
      return parseState(value);
    case EFFECT_SCHEMA:
      return parseEffect(value);
    case STATEMENT_SCHEMA:
      return parseStatement(value);
    case COMMIT_V2_SCHEMA:
      return parseCommitV2(value);
    default:
      return schemaError('Unknown protocol object schema', '$.schema');
  }
}

export function parseProtocolBytes(bytes: Uint8Array | string): ProtocolObject {
  return parseProtocolObject(parseProtocolJson(bytes));
}

export type ParsedDescriptor =
  | StateDescriptor
  | EffectDescriptor
  | StatementDescriptor
  | CommitDescriptor;
