/**
 * Language-level vocabulary for the T3X Transition protocol.
 *
 * This module intentionally contains data contracts only. Parsing, hashing,
 * replay, resolution, policy evaluation, repository mutation, and projections
 * belong to later layers.
 */

export const STATE_SCHEMA = 't3x/state/v1' as const;
export const EFFECT_SCHEMA = 't3x/effect/v1' as const;
export const STATEMENT_SCHEMA = 't3x/statement/v1' as const;
export const COMMIT_V2_SCHEMA = 't3x/commit/v2' as const;
export const COMMIT_V2_MEDIA_TYPE = 'application/vnd.t3x.commit-v2+json' as const;

export const PROPOSAL_PREDICATE_TYPE = 't3x.proposal/v1' as const;
export const DECISION_PREDICATE_TYPE = 't3x.decision/v1' as const;
export const CORE_PREDICATE_TYPES = [PROPOSAL_PREDICATE_TYPE, DECISION_PREDICATE_TYPE] as const;

export const PUBLIC_PROTOCOL_NOUNS = ['state', 'effect', 'statement', 'commit'] as const;
export const PROTOCOL_CANONICALIZATION = 'RFC8785' as const;
export const PROTOCOL_HASH_ALGORITHM = 'sha256' as const;
export const PROTOCOL_DIGEST_DOMAIN = 't3x-object-v1' as const;

export const PROTOCOL_ERROR_CODES = [
  'OBJECT_NOT_FOUND',
  'OBJECT_DIGEST_MISMATCH',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNSUPPORTED_SEMANTICS',
  'SCHEMA_INVALID',
  'NON_CANONICAL_VALUE',
  'INTEGRITY_CHAIN_INVALID',
  'EFFECT_CLAIM_FALSE',
  'STALE_BASE',
] as const;

export type ProtocolNoun = (typeof PUBLIC_PROTOCOL_NOUNS)[number];
export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];
export type CorePredicateType = (typeof CORE_PREDICATE_TYPES)[number];
export type ProtocolSchema =
  | typeof STATE_SCHEMA
  | typeof EFFECT_SCHEMA
  | typeof STATEMENT_SCHEMA
  | typeof COMMIT_V2_SCHEMA;
export type ObjectKind = ProtocolNoun;
export type Digest = `sha256:${string}`;
export type CanonicalTimestamp = string;

/** RFC 8785 operates on the I-JSON-compatible value domain. */
export type ProtocolValue =
  | null
  | boolean
  | number
  | string
  | ProtocolValue[]
  | { [key: string]: ProtocolValue };

/** Immutable bytes outside the four protocol object kinds. */
export interface ResourceDescriptor {
  uri: string;
  mediaType: string;
  digest: Digest;
}

interface Descriptor<K extends ObjectKind, S extends ProtocolSchema> {
  kind: K;
  schema: S;
  digest: Digest;
}

export type StateDescriptor = Descriptor<'state', typeof STATE_SCHEMA>;
export type EffectDescriptor = Descriptor<'effect', typeof EFFECT_SCHEMA>;
export type StatementDescriptor = Descriptor<'statement', typeof STATEMENT_SCHEMA>;
export type CommitDescriptor = Descriptor<'commit', typeof COMMIT_V2_SCHEMA>;
export type ObjectDescriptor =
  | StateDescriptor
  | EffectDescriptor
  | StatementDescriptor
  | CommitDescriptor;

/** Claimed principal. Authentication and authority are service-layer facts. */
export interface ActorRef {
  kind: 'human' | 'agent' | 'service';
  id: string;
}

export interface EvidenceRef {
  resource: ResourceDescriptor;
  locator: {
    scheme: string;
    value: ProtocolValue;
  };
}

export interface StateCodecRef {
  mediaType: string;
  version: string;
}

export interface MutationDriverRef {
  protocol: string;
  protocolVersion: string;
  specDigest: Digest;
}

export interface State {
  schema: typeof STATE_SCHEMA;
  codec: StateCodecRef;
  value: ProtocolValue;
}

export interface EffectInput {
  role: string;
  object: ObjectDescriptor;
}

interface EffectBody {
  driver: MutationDriverRef;
  operations: ProtocolValue[];
  inputs: EffectInput[];
}

/**
 * Internal replay view. It is a supporting type, not a fifth protocol noun.
 * The negative fields make a full Effect ineligible as Replay input: callers
 * must project the definition explicitly, keeping the claimed Result outside
 * the function that derives it.
 */
export interface EffectDefinition extends EffectBody {
  schema?: never;
  base?: never;
  result?: never;
}

export interface Effect extends EffectBody {
  schema: typeof EFFECT_SCHEMA;
  base: StateDescriptor;
  result: StateDescriptor;
}

export interface StatedClaim<T extends string = string> {
  mode: 'stated';
  value: T;
  evidence: [EvidenceRef, ...EvidenceRef[]];
}

export interface InferredClaim<T extends string = string> {
  mode: 'inferred';
  value: T;
  evidence: EvidenceRef[];
}

export interface AuthoredClaim<T extends string = string> {
  mode: 'authored';
  value: T;
  evidence: EvidenceRef[];
}

export interface UnspecifiedClaim {
  mode: 'unspecified';
}

export type Claim<T extends string = string> =
  | StatedClaim<T>
  | InferredClaim<T>
  | AuthoredClaim<T>
  | UnspecifiedClaim;
export type StringClaim = Claim<string>;

/**
 * Claim attribution is intentionally single-source: the enclosing Statement
 * actor is the producer or author. A different submitter, confirmer, or
 * evaluator attaches another Statement instead of rewriting that attribution.
 */

export type ProposalPredicate = {
  intent: StringClaim;
  rationale: StringClaim;
};

export type DecisionPolicyRef =
  | {
      mode: 'evaluated';
      resource: ResourceDescriptor;
    }
  | {
      mode: 'not_evaluated';
    };

export type DecisionOutcome = 'accepted' | 'overridden' | 'rejected';

export type DecisionPredicate = {
  policy: DecisionPolicyRef;
  considered: StatementDescriptor[];
  outcome: DecisionOutcome;
  rationale: StringClaim;
  decidedAt: CanonicalTimestamp;
};

/**
 * Shared typed-claim envelope. Core profiles narrow subjects and predicates;
 * external predicate types remain open and versioned.
 */
export interface Statement<
  PredicateType extends string = string,
  Predicate = ProtocolValue,
  Subjects extends ObjectDescriptor[] = ObjectDescriptor[],
> {
  schema: typeof STATEMENT_SCHEMA;
  subjects: Subjects;
  actor: ActorRef;
  predicateType: PredicateType;
  predicate: Predicate;
}

export type ProposalStatement = Statement<
  typeof PROPOSAL_PREDICATE_TYPE,
  ProposalPredicate,
  [EffectDescriptor]
>;

export type DecisionStatement = Statement<
  typeof DECISION_PREDICATE_TYPE,
  DecisionPredicate,
  [StatementDescriptor]
>;

export type ExternalStatement<
  PredicateType extends string = string,
  Predicate = ProtocolValue,
> = PredicateType extends CorePredicateType
  ? never
  : Statement<PredicateType, Predicate, ObjectDescriptor[]>;

export interface CommitV2 {
  schema: typeof COMMIT_V2_SCHEMA;
  parents: CommitDescriptor[];
  decision: StatementDescriptor;
  result: StateDescriptor;
}

export type ProtocolObject =
  | State
  | Effect
  | Statement
  | ProposalStatement
  | DecisionStatement
  | CommitV2;
