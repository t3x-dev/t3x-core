import {
  type CommitDescriptor,
  DECISION_PREDICATE_TYPE,
  type DecisionStatement,
  describeProtocolObject,
  type Effect,
  type ObjectDescriptor,
  PROPOSAL_PREDICATE_TYPE,
  parseCommitV2,
  parseDecisionStatement,
  parseEffect,
  parseProposalStatement,
  parseStatement,
  SchemaInvalidError,
  type Statement,
  type StatementDescriptor,
  type StringClaim,
} from '@t3x-dev/transition';
import { projectCommitV2 } from '../transition-commits/projection';
import { evaluateAcceptance, type PolicyFailure } from '../transition-decisions/evaluation';
import { deriveAssuranceReport } from '../transition-statements/assurance';
import { HUMAN_CONFIRMATION_PREDICATE_TYPE } from '../transition-statements/profiles';
import {
  type ActionCapabilityView,
  type ClaimOrigin,
  type ClaimView,
  type ProjectionCapabilityReason,
  type ProjectTransitionGraphInput,
  type ProjectTransitionViewInput,
  TRANSITION_VIEW_SCHEMA,
  type TransitionCapabilitiesView,
  type TransitionDecisionView,
  type TransitionGraphViewV1,
  type TransitionStatementAuditView,
  type TransitionViewV1,
} from './types';

function descriptorEqual(left: ObjectDescriptor, right: ObjectDescriptor): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

function claimOrigin(mode: Exclude<StringClaim['mode'], 'unspecified'>): ClaimOrigin {
  if (mode === 'stated') return 'request_source';
  if (mode === 'inferred') return 'inferred';
  return 'actor_authored';
}

function projectClaim(claim: StringClaim): ClaimView {
  if (claim.mode === 'unspecified') {
    return { mode: 'unspecified', origin: 'not_provided', evidence: [] };
  }
  return {
    mode: claim.mode,
    origin: claimOrigin(claim.mode),
    value: claim.value,
    evidence: structuredClone(claim.evidence),
  } as ClaimView;
}

function reason(
  code: ProjectionCapabilityReason['code'],
  message: string
): ProjectionCapabilityReason {
  return { code, message };
}

function disposition(
  value: ActionCapabilityView['disposition'],
  reasons: ProjectionCapabilityReason[] = []
): ActionCapabilityView {
  return { disposition: value, reasons };
}

function policyReasons(failures: readonly PolicyFailure[]): ProjectionCapabilityReason[] {
  return failures.map((failure) => ({ code: failure.code, message: failure.message }));
}

function unavailableDecisionCapabilities(): Pick<
  TransitionCapabilitiesView,
  'accept' | 'override' | 'reject'
> {
  const required = reason(
    'POLICY_CONTEXT_REQUIRED',
    'Trusted actor, policy, issuer, and observation facts are required to preview this action'
  );
  return {
    accept: disposition('not_evaluated', [{ ...required }]),
    override: disposition('not_evaluated', [{ ...required }]),
    reject: disposition('not_evaluated', [{ ...required }]),
  };
}

function completedDecisionCapabilities(): Pick<
  TransitionCapabilitiesView,
  'accept' | 'override' | 'reject'
> {
  const supplied = reason(
    'DECISION_ALREADY_SUPPLIED',
    'This immutable Proposal graph already includes a Decision'
  );
  return {
    accept: disposition('not_applicable', [{ ...supplied }]),
    override: disposition('not_applicable', [{ ...supplied }]),
    reject: disposition('not_applicable', [{ ...supplied }]),
  };
}

function previewDecisionCapabilities(
  input: ProjectTransitionGraphInput,
  effect: Effect,
  proposal: ReturnType<typeof parseProposalStatement>
): Pick<TransitionCapabilitiesView, 'accept' | 'override' | 'reject'> {
  if (input.decision !== undefined) return completedDecisionCapabilities();
  if (input.capabilityContext === undefined) return unavailableDecisionCapabilities();

  const common = {
    actorContext: input.capabilityContext.actorContext,
    effect,
    observationScope: input.observationScope,
    policy: input.capabilityContext.policy,
    policyResource: input.capabilityContext.policyResource,
    proposal,
    statements: input.observations,
  };
  const accept = evaluateAcceptance({
    ...common,
    outcome: 'accepted',
    rationale: { mode: 'unspecified' },
  });
  const override = evaluateAcceptance({
    ...common,
    outcome: 'overridden',
    rationale: { mode: 'authored', value: 'Capability preview', evidence: [] },
  });
  const reject = evaluateAcceptance({
    ...common,
    outcome: 'rejected',
    rationale: { mode: 'unspecified' },
  });

  return {
    accept: accept.permitted
      ? disposition('allowed')
      : disposition('denied', policyReasons(accept.failures)),
    override: override.permitted
      ? disposition('allowed')
      : disposition(
          'denied',
          override.failures.length === 0
            ? [reason('OVERRIDE_NOT_REQUIRED', 'No policy failure requires an override')]
            : policyReasons(override.failures)
        ),
    reject: reject.permitted
      ? disposition('allowed')
      : disposition('denied', policyReasons(reject.failures)),
  };
}

function commitCapability(
  decision: DecisionStatement | undefined,
  hasCommit: boolean
): ActionCapabilityView {
  if (hasCommit) {
    return disposition('not_applicable', [
      reason('COMMIT_ALREADY_SUPPLIED', 'This Transition graph already includes a CommitV2'),
    ]);
  }
  if (decision === undefined) {
    return disposition('not_applicable', [
      reason('DECISION_REQUIRED', 'An accepted or overridden Decision is required before CommitV2'),
    ]);
  }
  if (decision.predicate.outcome === 'rejected') {
    return disposition('not_applicable', [
      reason('DECISION_REJECTED', 'A rejected Decision cannot produce CommitV2'),
    ]);
  }
  return disposition('not_evaluated', [
    reason(
      'REPOSITORY_AUTHORIZATION_REQUIRED',
      'Repository authority and the current expected head must be re-evaluated before CommitV2'
    ),
  ]);
}

function revertCapability(hasCommit: boolean): ActionCapabilityView {
  if (!hasCommit) {
    return disposition('not_applicable', [
      reason('COMMIT_REQUIRED', 'A committed version is required before a revert can be proposed'),
    ]);
  }
  return disposition('not_evaluated', [
    reason(
      'REPOSITORY_AUTHORIZATION_REQUIRED',
      'Revert requires a new Effect, Proposal, Decision, and expected-head evaluation'
    ),
  ]);
}

function assertKnownStatementSubject(
  statement: Statement,
  effectDescriptor: ObjectDescriptor,
  resultDescriptor: ObjectDescriptor,
  proposalDescriptor: ObjectDescriptor
): void {
  if (
    statement.predicateType === PROPOSAL_PREDICATE_TYPE ||
    statement.predicateType === DECISION_PREDICATE_TYPE
  ) {
    throw new SchemaInvalidError(
      'Proposal and Decision Statements belong in their dedicated graph positions',
      '$.observations'
    );
  }
  let expected: ObjectDescriptor | undefined;
  if (statement.predicateType.startsWith('t3x.dev/replay-verification/')) {
    expected = effectDescriptor;
  } else if (statement.predicateType.startsWith('t3x.dev/yschema-validation/')) {
    expected = resultDescriptor;
  } else if (statement.predicateType.startsWith('t3x.dev/runner-validation/')) {
    expected = resultDescriptor;
  } else if (statement.predicateType === HUMAN_CONFIRMATION_PREDICATE_TYPE) {
    expected = proposalDescriptor;
  }
  if (
    expected !== undefined &&
    (statement.subjects.length !== 1 || !descriptorEqual(statement.subjects[0]!, expected))
  ) {
    throw new SchemaInvalidError(
      `Statement ${statement.predicateType} does not subject this Transition graph`,
      '$.observations'
    );
  }
}

function parseObservations(
  input: ProjectTransitionGraphInput,
  effectDescriptor: ObjectDescriptor,
  resultDescriptor: ObjectDescriptor,
  proposalDescriptor: ObjectDescriptor
): {
  statements: Statement[];
  audit: TransitionStatementAuditView[];
  descriptors: Map<string, StatementDescriptor>;
} {
  const statements: Statement[] = [];
  const audit: TransitionStatementAuditView[] = [];
  const descriptors = new Map<string, StatementDescriptor>();
  for (const observation of input.observations) {
    const statement = parseStatement(observation.statement);
    if (
      !['human', 'agent', 'service'].includes(observation.issuerContext.actor.kind) ||
      observation.issuerContext.actor.id.length === 0
    ) {
      throw new SchemaInvalidError(
        'Observation issuer context requires a valid authenticated actor',
        '$.observations'
      );
    }
    assertKnownStatementSubject(statement, effectDescriptor, resultDescriptor, proposalDescriptor);
    const descriptor = describeProtocolObject(statement);
    if (descriptors.has(descriptor.digest)) {
      throw new SchemaInvalidError('Observation Statements must be unique', '$.observations');
    }
    descriptors.set(descriptor.digest, descriptor);
    statements.push(statement);
    audit.push({
      statement: descriptor,
      subjects: structuredClone(statement.subjects),
      predicateType: statement.predicateType,
      claimedActor: { ...statement.actor },
      issuerActor: { ...observation.issuerContext.actor },
    });
  }
  audit.sort((left, right) =>
    left.statement.digest < right.statement.digest
      ? -1
      : left.statement.digest > right.statement.digest
        ? 1
        : 0
  );
  return { statements, audit, descriptors };
}

function parseDecision(
  input: ProjectTransitionGraphInput,
  proposalDescriptor: StatementDescriptor,
  observationDescriptors: ReadonlyMap<string, StatementDescriptor>
): DecisionStatement | undefined {
  if (input.decision === undefined) return undefined;
  const decision = parseDecisionStatement(input.decision);
  if (!descriptorEqual(decision.subjects[0], proposalDescriptor)) {
    throw new SchemaInvalidError(
      'Decision must subject the supplied Proposal',
      '$.decision.subjects[0]'
    );
  }
  for (const considered of decision.predicate.considered) {
    const observed = observationDescriptors.get(considered.digest);
    if (observed === undefined || !descriptorEqual(observed, considered)) {
      throw new SchemaInvalidError(
        'Every considered Statement must be present in the projected observation set',
        '$.decision.predicate.considered'
      );
    }
  }
  return decision;
}

function projectDecision(decision: DecisionStatement | undefined): TransitionDecisionView {
  if (decision === undefined) return { observation: 'not_supplied' };
  return {
    observation: 'supplied',
    statement: describeProtocolObject(decision),
    actor: { ...decision.actor },
    outcome: decision.predicate.outcome,
    policy: structuredClone(decision.predicate.policy),
    considered: structuredClone(decision.predicate.considered),
    rationale: projectClaim(decision.predicate.rationale),
    decidedAt: decision.predicate.decidedAt,
  };
}

function projectModern(input: ProjectTransitionGraphInput): TransitionGraphViewV1 {
  const effect = parseEffect(input.effect);
  const proposal = parseProposalStatement(input.proposal);
  const effectDescriptor = describeProtocolObject(effect);
  const proposalDescriptor = describeProtocolObject(proposal);
  if (!descriptorEqual(proposal.subjects[0], effectDescriptor)) {
    throw new SchemaInvalidError(
      'Proposal must subject the supplied Effect',
      '$.proposal.subjects[0]'
    );
  }

  const observations = parseObservations(
    input,
    effectDescriptor,
    effect.result,
    proposalDescriptor
  );
  const decision = parseDecision(input, proposalDescriptor, observations.descriptors);
  let history: TransitionGraphViewV1['history'] = { observation: 'not_committed' };
  let commitDescriptor: CommitDescriptor | undefined;
  if (input.commit !== undefined) {
    if (input.commit.recordedAt.length === 0) {
      throw new SchemaInvalidError('Commit recordedAt must be non-empty', '$.commit.recordedAt');
    }
    if (decision === undefined) {
      throw new SchemaInvalidError(
        'CommitV2 requires the supplied Decision',
        '$.commit.object.decision'
      );
    }
    const commit = parseCommitV2(input.commit.object);
    const decisionDescriptor = describeProtocolObject(decision);
    if (!descriptorEqual(commit.decision, decisionDescriptor)) {
      throw new SchemaInvalidError(
        'CommitV2 must bind the supplied Decision',
        '$.commit.object.decision'
      );
    }
    if (!descriptorEqual(commit.result, effect.result)) {
      throw new SchemaInvalidError(
        'CommitV2 Result must equal the supplied Effect Result',
        '$.commit.object.result'
      );
    }
    if (decision.predicate.outcome === 'rejected') {
      throw new SchemaInvalidError('Rejected Decisions cannot produce CommitV2', '$.decision');
    }
    history = {
      observation: 'committed',
      commit: projectCommitV2(commit, input.commit.recordedAt) as Extract<
        ReturnType<typeof projectCommitV2>,
        { format: 'transition_v2' }
      >,
    };
    commitDescriptor = describeProtocolObject(commit);
  }

  const assurance = deriveAssuranceReport({
    observationScope: input.observationScope,
    statements: observations.statements,
    proposal,
    decision,
    objectIntegrity: input.objectIntegrity,
  });
  const decisionCapabilities = previewDecisionCapabilities(input, effect, proposal);
  const capabilities: TransitionCapabilitiesView = {
    ...decisionCapabilities,
    commit: commitCapability(decision, input.commit !== undefined),
    revert: revertCapability(input.commit !== undefined),
  };

  return {
    schema: TRANSITION_VIEW_SCHEMA,
    version: 1,
    mode: 'transition',
    change: {
      effect: effectDescriptor,
      base: { ...effect.base },
      result: { ...effect.result },
      driver: { ...effect.driver },
      operations: structuredClone(effect.operations),
    },
    claims: {
      proposal: proposalDescriptor,
      actor: { ...proposal.actor },
      intent: projectClaim(proposal.predicate.intent),
      rationale: projectClaim(proposal.predicate.rationale),
    },
    checks: {
      objectIntegrity: assurance.objectIntegrity,
      observationScope: assurance.observationScope,
      replay: assurance.replay,
      validation: assurance.validation,
      runner: assurance.runner,
      humanConfirmation: assurance.humanConfirmation,
    },
    decision: projectDecision(decision),
    history,
    capabilities,
    audit: {
      effect: effectDescriptor,
      proposal: proposalDescriptor,
      statements: observations.audit,
      ...(decision === undefined ? {} : { decision: describeProtocolObject(decision) }),
      ...(commitDescriptor === undefined ? {} : { commit: commitDescriptor }),
    },
  };
}

/**
 * Build a deterministic, non-authoritative product view from immutable graph
 * objects and trusted application context. The output can explain available
 * actions, but it can never authorize a Decision, Commit, branch advance, or
 * revert; every mutating entry point must re-resolve its own trust facts.
 */
export function projectTransitionView(input: ProjectTransitionViewInput): TransitionViewV1 {
  return projectModern(input);
}
