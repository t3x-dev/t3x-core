import {
  type CanonicalTimestamp,
  type DecisionStatement,
  describeProtocolObject,
  type Effect,
  type ProposalStatement,
  type ProtocolObject,
  type StringClaim,
} from '@t3x-dev/transition';
import {
  createDecisionStatement,
  type DecisionCreationResult,
} from '../transition-decisions/decision';
import type {
  ActorContext,
  PolicyEvaluation,
  RequestedDecisionOutcome,
  StatementObservation,
} from '../transition-decisions/evaluation';
import type { AcceptancePolicy } from '../transition-decisions/policy';
import type { ObservationScope } from '../transition-statements/assurance';

export interface TrustedDecisionFacts {
  actorContext: ActorContext;
  observationScope: ObservationScope;
  policy: AcceptancePolicy;
  policyResource: PolicyEvaluation['policy'];
  statements: readonly StatementObservation[];
}

/**
 * Application-owned trust port. Implementations select policy and derive all
 * authenticated actor, issuer, and resolver-scope facts from server-side state.
 */
export interface RepositoryDecisionAuthority {
  resolve(input: {
    projectId: string;
    refName: string;
    proposal: ProposalStatement;
    effect: Effect;
  }): Promise<TrustedDecisionFacts>;
}

export interface AuthorizeRepositoryDecisionInput {
  projectId: string;
  refName: string;
  proposal: ProposalStatement;
  effect: Effect;
  outcome: RequestedDecisionOutcome;
  rationale: StringClaim;
  decidedAt: CanonicalTimestamp;
  authority: RepositoryDecisionAuthority;
}

export interface RepositoryDecisionRecord {
  readonly projectId: string;
  readonly refName: string;
  readonly decision: DecisionStatement;
  readonly evaluation: PolicyEvaluation;
  readonly observationScope: ObservationScope;
  /** Trusted issuer facts for the exact Statements considered by the Decision. */
  readonly observations: readonly StatementObservation[];
  readonly objects: readonly ProtocolObject[];
}

/**
 * Separate capability for advancing CommitV2 history. Every trusted Decision
 * is recordable, but rejected Decisions never receive this capability.
 */
export interface RepositoryDecisionAuthorization extends RepositoryDecisionRecord {}

export type RepositoryDecisionAuthorizationResult =
  | Extract<DecisionCreationResult, { ok: false }>
  | (Extract<DecisionCreationResult, { ok: true }> & {
      record: RepositoryDecisionRecord;
      authorization: RepositoryDecisionAuthorization | null;
    });

const issuedRecords = new WeakSet<object>();
const issuedAuthorizations = new WeakSet<object>();

function freezeRecursively<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeRecursively(child);
  }
  return Object.freeze(value);
}

function immutableSnapshot<T>(value: T): T {
  return freezeRecursively(structuredClone(value));
}

export function isRepositoryDecisionAuthorization(
  value: unknown
): value is RepositoryDecisionAuthorization {
  return typeof value === 'object' && value !== null && issuedAuthorizations.has(value);
}

export function isRepositoryDecisionRecord(value: unknown): value is RepositoryDecisionRecord {
  return typeof value === 'object' && value !== null && issuedRecords.has(value);
}

/**
 * Re-resolve every trust fact through the application authority before issuing
 * a process-local capability. Rejected Decisions remain auditable but never
 * receive repository commit authority.
 */
export async function authorizeDecisionForRepository(
  input: AuthorizeRepositoryDecisionInput
): Promise<RepositoryDecisionAuthorizationResult> {
  if (input.projectId.length === 0 || input.refName.length === 0) {
    throw new TypeError('Repository Decision authorization requires projectId and refName');
  }
  const trusted = await input.authority.resolve({
    projectId: input.projectId,
    refName: input.refName,
    proposal: input.proposal,
    effect: input.effect,
  });
  const created = createDecisionStatement({
    actorContext: trusted.actorContext,
    effect: input.effect,
    observationScope: trusted.observationScope,
    outcome: input.outcome,
    policy: trusted.policy,
    policyResource: trusted.policyResource,
    proposal: input.proposal,
    rationale: input.rationale,
    statements: trusted.statements,
    decidedAt: input.decidedAt,
  });
  if (!created.ok) return created;
  const considered = new Set(created.evaluation.considered.map((statement) => statement.digest));
  const observations = trusted.statements.filter((observation) =>
    considered.has(describeProtocolObject(observation.statement).digest)
  );
  if (observations.length !== considered.size) {
    throw new TypeError('Repository Decision authorization lost trusted Statement issuer facts');
  }
  const objects = [
    input.effect,
    input.proposal,
    ...observations.map((observation) => observation.statement),
    created.decision,
  ];
  const record = immutableSnapshot<RepositoryDecisionRecord>({
    projectId: input.projectId,
    refName: input.refName,
    decision: created.decision,
    evaluation: created.evaluation,
    observationScope: {
      completeness: trusted.observationScope.completeness,
      sources: [...trusted.observationScope.sources].sort(),
    },
    observations,
    objects,
  });
  issuedRecords.add(record);

  if (
    describeProtocolObject(record.decision).digest !==
    describeProtocolObject(created.decision).digest
  ) {
    throw new TypeError('Repository Decision record lost Decision identity');
  }
  if (created.decision.predicate.outcome === 'rejected') {
    return { ...created, record, authorization: null };
  }

  const authorization = record as RepositoryDecisionAuthorization;
  issuedAuthorizations.add(authorization);
  return { ...created, record, authorization };
}
