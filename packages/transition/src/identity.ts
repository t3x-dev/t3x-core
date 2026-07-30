import { createHash } from 'node:crypto';
import { canonicalProtocolBytes } from './canonical';
import {
  COMMIT_V2_SCHEMA,
  type CommitDescriptor,
  type CommitV2,
  type DecisionStatement,
  EFFECT_SCHEMA,
  type Effect,
  type EffectDescriptor,
  type ObjectDescriptor,
  type ObjectKind,
  PROTOCOL_DIGEST_DOMAIN,
  PROTOCOL_HASH_ALGORITHM,
  type ProposalStatement,
  type ProtocolObject,
  type ProtocolSchema,
  type ProtocolValue,
  STATE_SCHEMA,
  STATEMENT_SCHEMA,
  type State,
  type StateDescriptor,
  type Statement,
  type StatementDescriptor,
} from './contracts';
import { UnsupportedMediaTypeError } from './errors';
import { parseProtocolObject } from './parse';

function kindForSchema(schema: ProtocolSchema): ObjectKind {
  switch (schema) {
    case STATE_SCHEMA:
      return 'state';
    case EFFECT_SCHEMA:
      return 'effect';
    case STATEMENT_SCHEMA:
      return 'statement';
    case COMMIT_V2_SCHEMA:
      return 'commit';
  }
}

function expectedSchema(kind: ObjectKind): ProtocolSchema {
  switch (kind) {
    case 'state':
      return STATE_SCHEMA;
    case 'effect':
      return EFFECT_SCHEMA;
    case 'statement':
      return STATEMENT_SCHEMA;
    case 'commit':
      return COMMIT_V2_SCHEMA;
  }
}

export function canonicalProtocolObjectBytes(object: ProtocolObject): Uint8Array {
  const parsed = parseProtocolObject(object);
  return canonicalProtocolBytes(parsed as unknown as ProtocolValue);
}

/** Hash already-canonical object bytes with the protocol's kind/schema domain prefix. */
export function digestCanonicalProtocolBytes(
  kind: ObjectKind,
  schema: ProtocolSchema,
  bytes: Uint8Array
): `sha256:${string}` {
  if (expectedSchema(kind) !== schema) {
    throw new UnsupportedMediaTypeError(`Schema ${schema} does not identify a ${kind} object`);
  }
  const prefix = `${PROTOCOL_DIGEST_DOMAIN}\0${kind}\0${schema}\0`;
  const hex = createHash(PROTOCOL_HASH_ALGORITHM)
    .update(prefix, 'utf8')
    .update(bytes)
    .digest('hex');
  return `${PROTOCOL_HASH_ALGORITHM}:${hex}`;
}

export function digestProtocolObject(object: ProtocolObject): `sha256:${string}` {
  const parsed = parseProtocolObject(object);
  const kind = kindForSchema(parsed.schema);
  return digestCanonicalProtocolBytes(kind, parsed.schema, canonicalProtocolObjectBytes(parsed));
}

export function describeProtocolObject(object: State): StateDescriptor;
export function describeProtocolObject(object: Effect): EffectDescriptor;
export function describeProtocolObject(
  object: ProposalStatement | DecisionStatement
): StatementDescriptor;
export function describeProtocolObject(object: Statement): StatementDescriptor;
export function describeProtocolObject(object: CommitV2): CommitDescriptor;
export function describeProtocolObject(object: ProtocolObject): ObjectDescriptor;
export function describeProtocolObject(object: ProtocolObject): ObjectDescriptor {
  const parsed = parseProtocolObject(object);
  const kind = kindForSchema(parsed.schema);
  return {
    kind,
    schema: parsed.schema,
    digest: digestProtocolObject(parsed),
  } as ObjectDescriptor;
}
