import {
  type ActorRef,
  canonicalizeProtocolValue,
  describeProtocolObject,
  type Effect,
  type ProposalStatement,
  type ProtocolValue,
  parseEffect,
  parseProposalStatement,
  parseStatement,
  type ResourceDescriptor,
  SchemaInvalidError,
  type Statement,
  type StatementDescriptor,
  type StringClaim,
} from '@t3x-dev/transition';
import type { ObservationScope } from '../transition-statements/assurance';
import {
  HUMAN_CONFIRMATION_PREDICATE_TYPE,
  parseHumanConfirmationStatement,
  parseReplayVerificationStatement,
  parseRunnerValidationStatement,
  parseYSchemaValidationStatement,
  REPLAY_VERIFICATION_PREDICATE_TYPE,
  RUNNER_VALIDATION_PREDICATE_TYPE,
  YSCHEMA_VALIDATION_PREDICATE_TYPE,
} from '../transition-statements/profiles';
import {
  type AcceptancePolicy,
  parseAcceptancePolicy,
  selectorMatches,
  verifyAcceptancePolicyResource,
} from './policy';

export const POLICY_FAILURE_CODES = [
  'CLAIM_EVIDENCE_INSUFFICIENT',
  'CLAIM_MODE_NOT_ALLOWED',
  'HUMAN_CONFIRMATION_REQUIRED',
  'INVALID_OVERRIDE_RATIONALE',
  'OBSERVATION_SCOPE_INCOMPLETE',
  'REPLAY_CLAIM_FALSE',
  'REPLAY_NOT_VERIFIED',
  'RUNNER_CONFLICT',
  'RUNNER_FAILED',
  'RUNNER_REQUIRED',
  'SELF_APPROVAL_FORBIDDEN',
  'UNAUTHORIZED_DECISION',
  'UNAUTHORIZED_OVERRIDE',
  'VALIDATION_CONFLICT',
  'VALIDATION_FAILED',
  'VALIDATION_REQUIRED',
] as const;

export type PolicyFailureCode = (typeof POLICY_FAILURE_CODES)[number];
export type RequestedDecisionOutcome = 'accepted' | 'overridden' | 'rejected';

export interface ActorContext {
  /** Exact identity established by the application authentication boundary. */
  actor: ActorRef;
}

export interface StatementObservation {
  statement: Statement;
  /**
   * Trusted resolver/authentication facts; distinct from the Statement's claimed actor.
   * The application MUST NOT construct this context from Statement or request payload fields.
   */
  issuerContext: ActorContext;
}

export interface PolicyFailure {
  code: PolicyFailureCode;
  path: string;
  message: string;
  overrideable: boolean;
  details?: ProtocolValue;
}

export interface PolicyEvaluation {
  schema: 't3x.dev/policy-evaluation/v1';
  permitted: boolean;
  requestedOutcome: RequestedDecisionOutcome;
  actor: ActorRef;
  proposal: StatementDescriptor;
  policy: ResourceDescriptor;
  considered: StatementDescriptor[];
  rationale: StringClaim;
  failures: PolicyFailure[];
}

export interface DecisionCapabilities {
  canAccept: boolean;
  canOverride: boolean;
  canReject: boolean;
  acceptanceFailures: PolicyFailure[];
  overrideFailures: PolicyFailure[];
}

interface EvaluationFacts {
  actorAuthorizedToDecide: boolean;
  actorAuthorizedToOverride: boolean;
  actorIsProposer: boolean;
  considered: StatementDescriptor[];
  policyFailures: PolicyFailure[];
}

/**
 * Inputs to the pure evaluator.
 *
 * The application boundary is responsible for selecting the policy applicable to the
 * project/ref, authenticating actor and issuer contexts, and deriving observation scope
 * from the resolver. Content addressing proves policy bytes, not policy applicability;
 * none of these trust facts may be promoted from a client request.
 */
export interface EvaluateAcceptanceInput {
  actorContext: ActorContext;
  effect: Effect;
  observationScope: ObservationScope;
  outcome: RequestedDecisionOutcome;
  policy: unknown;
  policyResource: ResourceDescriptor;
  proposal: ProposalStatement;
  rationale: StringClaim;
  statements: readonly StatementObservation[];
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return (
    canonicalizeProtocolValue(left as ProtocolValue) ===
    canonicalizeProtocolValue(right as ProtocolValue)
  );
}

function sameActor(left: ActorRef, right: ActorRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function normalizedScope(scope: ObservationScope): ObservationScope {
  if (scope.sources.some((source) => source.length === 0)) {
    throw new SchemaInvalidError(
      'Observation scope sources must be non-empty',
      '$.observationScope'
    );
  }
  if (new Set(scope.sources).size !== scope.sources.length) {
    throw new SchemaInvalidError('Observation scope sources must be unique', '$.observationScope');
  }
  if (scope.completeness !== 'complete' && scope.completeness !== 'partial') {
    throw new SchemaInvalidError(
      'Unknown observation scope completeness',
      '$.observationScope.completeness'
    );
  }
  return { completeness: scope.completeness, sources: [...scope.sources].sort() };
}

function hasAuthority(
  rule: AcceptancePolicy['authorization']['decide'],
  context: ActorContext
): boolean {
  return selectorMatches(rule.actors, context.actor);
}

function evidenceCount(claim: StringClaim): number {
  return claim.mode === 'unspecified' ? 0 : claim.evidence.length;
}

function claimFailures(
  proposal: ProposalStatement,
  policy: AcceptancePolicy,
  confirmations: ReturnType<typeof parseHumanConfirmationStatement>[]
): PolicyFailure[] {
  const failures: PolicyFailure[] = [];
  for (const name of ['intent', 'rationale'] as const) {
    const claim = proposal.predicate[name];
    const requirement = policy.claims[name];
    if (!requirement.allowedModes.includes(claim.mode)) {
      failures.push({
        code: 'CLAIM_MODE_NOT_ALLOWED',
        path: `$.proposal.predicate.${name}.mode`,
        message: `${name} claim mode ${claim.mode} is not allowed by policy`,
        overrideable: policy.override.allowClaimFailures,
        details: { claim: name, mode: claim.mode },
      });
    }
    const evidence = evidenceCount(claim);
    if (evidence < requirement.minimumEvidence) {
      failures.push({
        code: 'CLAIM_EVIDENCE_INSUFFICIENT',
        path: `$.proposal.predicate.${name}`,
        message: `${name} requires at least ${requirement.minimumEvidence} evidence references`,
        overrideable: policy.override.allowClaimFailures,
        details: { claim: name, actual: evidence, required: requirement.minimumEvidence },
      });
    }
    if (
      requirement.humanConfirmation === 'required' &&
      !confirmations.some((confirmation) => confirmation.predicate.confirms.includes(name))
    ) {
      failures.push({
        code: 'HUMAN_CONFIRMATION_REQUIRED',
        path: `$.proposal.predicate.${name}`,
        message: `${name} requires an acceptable human confirmation Statement`,
        overrideable: policy.override.allowMissingHumanConfirmation,
        details: { claim: name },
      });
    }
  }
  return failures;
}

function statementTrustMatches(
  rule: AcceptancePolicy['checks']['replay'],
  statement: ReturnType<typeof parseReplayVerificationStatement>,
  issuerContext: ActorContext,
  claimedResult: Effect['result']
): boolean {
  return (
    sameActor(statement.actor, issuerContext.actor) &&
    selectorMatches(rule.issuers, issuerContext.actor) &&
    selectorMatches(rule.tools, statement.predicate.tool) &&
    selectorMatches(rule.environments, statement.predicate.environment) &&
    (statement.predicate.outcome !== 'verified' ||
      canonicalEqual(statement.predicate.result, claimedResult))
  );
}

function validationTrustMatches(
  rule: AcceptancePolicy['checks']['validation'],
  statement: ReturnType<typeof parseYSchemaValidationStatement>,
  issuerContext: ActorContext
): boolean {
  return (
    sameActor(statement.actor, issuerContext.actor) &&
    selectorMatches(rule.issuers, issuerContext.actor) &&
    selectorMatches(rule.tools, statement.predicate.tool) &&
    selectorMatches(rule.environments, statement.predicate.environment) &&
    selectorMatches(rule.profiles, statement.predicate.profile) &&
    selectorMatches(rule.schemas, statement.predicate.schemaResource) &&
    selectorMatches(rule.contexts, statement.predicate.context)
  );
}

function runnerTrustMatches(
  rule: NonNullable<AcceptancePolicy['checks']['runner']>,
  statement: ReturnType<typeof parseRunnerValidationStatement>,
  issuerContext: ActorContext
): boolean {
  return (
    sameActor(statement.actor, issuerContext.actor) &&
    selectorMatches(rule.issuers, issuerContext.actor) &&
    selectorMatches(rule.tools, statement.predicate.tool) &&
    selectorMatches(rule.workflows, statement.predicate.workflow) &&
    selectorMatches(rule.environments, statement.predicate.environment)
  );
}

function sortDescriptors(descriptors: StatementDescriptor[]): StatementDescriptor[] {
  const byDigest = new Map(descriptors.map((descriptor) => [descriptor.digest, descriptor]));
  return [...byDigest.values()].sort((left, right) =>
    left.digest < right.digest ? -1 : left.digest > right.digest ? 1 : 0
  );
}

function policyFacts(input: EvaluateAcceptanceInput): {
  policy: AcceptancePolicy;
  resource: ResourceDescriptor;
  proposal: ProposalStatement;
  facts: EvaluationFacts;
} {
  const policy = parseAcceptancePolicy(input.policy);
  const resource = verifyAcceptancePolicyResource(policy, input.policyResource);
  const proposal = parseProposalStatement(input.proposal);
  const effect = parseEffect(input.effect);
  const scope = normalizedScope(input.observationScope);
  if (!canonicalEqual(proposal.subjects[0], describeProtocolObject(effect))) {
    throw new SchemaInvalidError(
      'Proposal must subject the supplied Effect',
      '$.proposal.subjects[0]'
    );
  }

  const effectDescriptor = describeProtocolObject(effect);
  const proposalDescriptor = describeProtocolObject(proposal);
  const considered: StatementDescriptor[] = [];
  const replayStatements: Array<{
    statement: ReturnType<typeof parseReplayVerificationStatement>;
    issuerContext: ActorContext;
  }> = [];
  const validationStatements: Array<{
    statement: ReturnType<typeof parseYSchemaValidationStatement>;
    issuerContext: ActorContext;
  }> = [];
  const runnerStatements: Array<{
    statement: ReturnType<typeof parseRunnerValidationStatement>;
    issuerContext: ActorContext;
  }> = [];
  const confirmations: Array<{
    statement: ReturnType<typeof parseHumanConfirmationStatement>;
    issuerContext: ActorContext;
  }> = [];

  for (const observation of input.statements) {
    const statement = parseStatement(observation.statement);
    const subject = statement.subjects[0];
    const relevantReplay =
      statement.subjects.length === 1 &&
      subject !== undefined &&
      canonicalEqual(subject, effectDescriptor) &&
      statement.predicateType.startsWith('t3x.dev/replay-verification/');
    const relevantValidation =
      statement.subjects.length === 1 &&
      subject !== undefined &&
      canonicalEqual(subject, effect.result) &&
      statement.predicateType.startsWith('t3x.dev/yschema-validation/');
    const relevantRunner =
      policy.checks.runner !== undefined &&
      statement.subjects.length === 1 &&
      subject !== undefined &&
      canonicalEqual(subject, effect.result) &&
      statement.predicateType.startsWith('t3x.dev/runner-validation/');
    const relevantConfirmation =
      statement.subjects.length === 1 &&
      subject !== undefined &&
      canonicalEqual(subject, proposalDescriptor) &&
      statement.predicateType === HUMAN_CONFIRMATION_PREDICATE_TYPE;

    if (!relevantReplay && !relevantValidation && !relevantRunner && !relevantConfirmation) {
      continue;
    }
    considered.push(describeProtocolObject(statement));
    if (statement.predicateType === REPLAY_VERIFICATION_PREDICATE_TYPE) {
      replayStatements.push({
        statement: parseReplayVerificationStatement(statement),
        issuerContext: observation.issuerContext,
      });
    } else if (statement.predicateType === YSCHEMA_VALIDATION_PREDICATE_TYPE) {
      validationStatements.push({
        statement: parseYSchemaValidationStatement(statement),
        issuerContext: observation.issuerContext,
      });
    } else if (statement.predicateType === RUNNER_VALIDATION_PREDICATE_TYPE) {
      runnerStatements.push({
        statement: parseRunnerValidationStatement(statement),
        issuerContext: observation.issuerContext,
      });
    } else if (statement.predicateType === HUMAN_CONFIRMATION_PREDICATE_TYPE) {
      confirmations.push({
        statement: parseHumanConfirmationStatement(statement),
        issuerContext: observation.issuerContext,
      });
    }
  }

  const acceptableReplay = replayStatements.filter((observation) =>
    statementTrustMatches(
      policy.checks.replay,
      observation.statement,
      observation.issuerContext,
      effect.result
    )
  );
  const acceptableValidation = validationStatements.filter((observation) =>
    validationTrustMatches(
      policy.checks.validation,
      observation.statement,
      observation.issuerContext
    )
  );
  const acceptableRunner =
    policy.checks.runner === undefined
      ? []
      : runnerStatements.filter((observation) =>
          runnerTrustMatches(
            policy.checks.runner as NonNullable<AcceptancePolicy['checks']['runner']>,
            observation.statement,
            observation.issuerContext
          )
        );
  const acceptableConfirmations = confirmations.filter(
    (observation) =>
      sameActor(observation.statement.actor, observation.issuerContext.actor) &&
      selectorMatches(policy.checks.humanConfirmation.issuers, observation.issuerContext.actor)
  );
  const failures = claimFailures(
    proposal,
    policy,
    acceptableConfirmations.map((observation) => observation.statement)
  );

  if (scope.completeness === 'partial') {
    failures.push({
      code: 'OBSERVATION_SCOPE_INCOMPLETE',
      path: '$.observationScope',
      message: 'A partial observation scope cannot authorize acceptance or override',
      overrideable: false,
      details: { check: 'decision', sources: scope.sources },
    });
  }

  const replayOutcomes = new Set(
    acceptableReplay.map((observation) => observation.statement.predicate.outcome)
  );
  if (replayOutcomes.has('false')) {
    failures.push({
      code: 'REPLAY_CLAIM_FALSE',
      path: '$.statements',
      message: 'Replay is false for the exact proposed Effect',
      overrideable: false,
    });
  } else if (!replayOutcomes.has('verified')) {
    failures.push({
      code: 'REPLAY_NOT_VERIFIED',
      path: '$.statements',
      message: 'No acceptable verified replay Statement was observed',
      overrideable: false,
    });
  }

  const validationOutcomes = new Set(
    acceptableValidation.map((observation) => observation.statement.predicate.outcome)
  );
  if (validationOutcomes.has('passed') && validationOutcomes.has('failed')) {
    failures.push({
      code: 'VALIDATION_CONFLICT',
      path: '$.statements',
      message: 'Conflicting acceptable validation Statements were observed',
      overrideable: policy.override.allowFailedValidation,
    });
  } else if (validationOutcomes.has('failed')) {
    failures.push({
      code: 'VALIDATION_FAILED',
      path: '$.statements',
      message: 'An acceptable validation Statement reports failure',
      overrideable: policy.override.allowFailedValidation,
    });
  } else if (
    policy.checks.validation.requirement === 'required' &&
    !validationOutcomes.has('passed')
  ) {
    failures.push({
      code: 'VALIDATION_REQUIRED',
      path: '$.statements',
      message: 'No acceptable passed validation Statement was observed',
      overrideable: policy.override.allowMissingValidation,
    });
  }

  if (policy.checks.runner !== undefined) {
    const runnerOutcomes = new Set(
      acceptableRunner.map((observation) => observation.statement.predicate.outcome)
    );
    if (runnerOutcomes.has('passed') && runnerOutcomes.has('failed')) {
      failures.push({
        code: 'RUNNER_CONFLICT',
        path: '$.statements',
        message: 'Conflicting acceptable runner validation Statements were observed',
        overrideable: policy.override.allowFailedRunner ?? false,
      });
    } else if (runnerOutcomes.has('failed')) {
      failures.push({
        code: 'RUNNER_FAILED',
        path: '$.statements',
        message: 'An acceptable runner validation Statement reports failure',
        overrideable: policy.override.allowFailedRunner ?? false,
      });
    } else if (policy.checks.runner.requirement === 'required' && !runnerOutcomes.has('passed')) {
      failures.push({
        code: 'RUNNER_REQUIRED',
        path: '$.statements',
        message: 'No acceptable passed runner validation Statement was observed',
        overrideable: policy.override.allowMissingRunner ?? false,
      });
    }
  }

  return {
    policy,
    resource,
    proposal,
    facts: {
      actorAuthorizedToDecide: hasAuthority(policy.authorization.decide, input.actorContext),
      actorAuthorizedToOverride: hasAuthority(policy.authorization.override, input.actorContext),
      actorIsProposer: sameActor(proposal.actor, input.actorContext.actor),
      considered: sortDescriptors(considered),
      policyFailures: failures,
    },
  };
}

function authorizationFailures(
  outcome: RequestedDecisionOutcome,
  policy: AcceptancePolicy,
  facts: EvaluationFacts
): PolicyFailure[] {
  const failures: PolicyFailure[] = [];
  if (outcome === 'overridden') {
    if (!facts.actorAuthorizedToOverride) {
      failures.push({
        code: 'UNAUTHORIZED_OVERRIDE',
        path: '$.actorContext',
        message: 'The authenticated actor is not authorized to override this policy',
        overrideable: false,
      });
    }
  } else if (!facts.actorAuthorizedToDecide) {
    failures.push({
      code: 'UNAUTHORIZED_DECISION',
      path: '$.actorContext',
      message: 'The authenticated actor is not authorized to decide under this policy',
      overrideable: false,
    });
  }
  if (outcome !== 'rejected' && facts.actorIsProposer && !policy.authorization.allowSelfApproval) {
    failures.push({
      code: 'SELF_APPROVAL_FORBIDDEN',
      path: '$.actorContext.actor',
      message: 'Policy forbids a proposer from accepting or overriding its own Proposal',
      overrideable: false,
    });
  }
  return failures;
}

function overrideRationaleFailure(
  outcome: RequestedDecisionOutcome,
  rationale: StringClaim
): PolicyFailure[] {
  if (
    outcome !== 'overridden' ||
    (rationale.mode === 'authored' && rationale.value.trim().length > 0)
  ) {
    return [];
  }
  return [
    {
      code: 'INVALID_OVERRIDE_RATIONALE',
      path: '$.rationale',
      message: 'Override requires a non-empty rationale authored by the Decision actor',
      overrideable: false,
    },
  ];
}

function permittedForOutcome(
  outcome: RequestedDecisionOutcome,
  failures: readonly PolicyFailure[]
): boolean {
  if (outcome === 'rejected') {
    return !failures.some((failure) => failure.code === 'UNAUTHORIZED_DECISION');
  }
  if (outcome === 'accepted') return failures.length === 0;
  return failures.length > 0 && failures.every((failure) => failure.overrideable);
}

/**
 * Pure policy evaluation over one exact Proposal graph and observation scope.
 * Statements are treated as a set; claimed run time and input order are never selectors.
 */
export function evaluateAcceptance(input: EvaluateAcceptanceInput): PolicyEvaluation {
  const { policy, resource, proposal, facts } = policyFacts(input);
  const failures = [
    ...facts.policyFailures,
    ...authorizationFailures(input.outcome, policy, facts),
    ...overrideRationaleFailure(input.outcome, input.rationale),
  ];
  return {
    schema: 't3x.dev/policy-evaluation/v1',
    permitted: permittedForOutcome(input.outcome, failures),
    requestedOutcome: input.outcome,
    actor: { ...input.actorContext.actor },
    proposal: describeProtocolObject(proposal),
    policy: { ...resource },
    considered: facts.considered,
    rationale: input.rationale,
    failures,
  };
}

/** Derived application capability view. It is never persisted or trusted as authorization. */
export function deriveDecisionCapabilities(
  input: Omit<EvaluateAcceptanceInput, 'outcome' | 'rationale'>
): DecisionCapabilities {
  const unspecified: StringClaim = { mode: 'unspecified' };
  const accept = evaluateAcceptance({ ...input, outcome: 'accepted', rationale: unspecified });
  const reject = evaluateAcceptance({ ...input, outcome: 'rejected', rationale: unspecified });
  const overrideRationale: StringClaim = {
    mode: 'authored',
    value: 'Capability probe',
    evidence: [],
  };
  const override = evaluateAcceptance({
    ...input,
    outcome: 'overridden',
    rationale: overrideRationale,
  });
  return {
    canAccept: accept.permitted,
    canOverride: override.permitted,
    canReject: reject.permitted,
    acceptanceFailures: accept.failures,
    overrideFailures: override.failures.filter(
      (failure) => failure.code !== 'INVALID_OVERRIDE_RATIONALE'
    ),
  };
}
