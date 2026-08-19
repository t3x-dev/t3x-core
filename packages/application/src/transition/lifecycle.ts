import {
  type PolicyFailure,
  PROPOSAL_GENERATION_PREPARATION_SCHEMA,
  type RequestedDecisionOutcome,
} from '@t3x-dev/core';
import type {
  DecisionStatement,
  ProtocolValue,
  ResourceDescriptor,
  StringClaim,
} from '@t3x-dev/transition';
import type { TransitionActorRef, TransitionInspectionGraph } from './inspect';

export interface TransitionReviewPrecondition {
  workspaceRevision: number;
  refName: string;
  refHead: string | null;
  effectDigest: string;
  proposalDigest: string;
  statementDigests: string[];
  policyDigest: string;
  reviewDigest?: string;
}

export class TransitionReviewStaleError extends Error {
  readonly code = 'TRANSITION_REVIEW_STALE';

  constructor() {
    super('Transition review facts changed; inspect and verify the Transition again');
    this.name = 'TransitionReviewStaleError';
  }
}

export class TransitionDecisionDeniedError extends Error {
  readonly code = 'TRANSITION_DECISION_DENIED';

  constructor(readonly failures: readonly PolicyFailure[]) {
    super('The requested Decision is not permitted by the server-selected policy');
    this.name = 'TransitionDecisionDeniedError';
  }
}

export class TransitionAutomatedOverrideDeniedError extends Error {
  readonly code = 'TRANSITION_AUTOMATED_OVERRIDE_DENIED';

  constructor() {
    super('Automated override is disabled in the first Transition rollout');
    this.name = 'TransitionAutomatedOverrideDeniedError';
  }
}

export class TransitionDecisionMembershipError extends Error {
  readonly code = 'INTEGRITY_CHAIN_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'TransitionDecisionMembershipError';
  }
}

function comparePortable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameDescriptor(
  left: { kind: string; schema: string; digest: string },
  right: { kind: string; schema: string; digest: string }
): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const orderedLeft = [...left].sort(comparePortable);
  const orderedRight = [...right].sort(comparePortable);
  return orderedLeft.every((value, index) => value === orderedRight[index]);
}

export function normalizedTransitionReviewPrecondition(
  precondition: TransitionReviewPrecondition
): ProtocolValue {
  return {
    workspace_revision: precondition.workspaceRevision,
    ref_name: precondition.refName,
    ref_head: precondition.refHead,
    effect_digest: precondition.effectDigest,
    proposal_digest: precondition.proposalDigest,
    statement_digests: [...precondition.statementDigests].sort(comparePortable),
    policy_digest: precondition.policyDigest,
  };
}

export function digestTransitionReviewPrecondition(
  precondition: TransitionReviewPrecondition,
  digestCanonicalRequest: (value: ProtocolValue) => string
): string {
  return digestCanonicalRequest(normalizedTransitionReviewPrecondition(precondition));
}

export function decisionRationale(input: {
  outcome: RequestedDecisionOutcome;
  actor: TransitionActorRef;
  rationale?: string;
}): StringClaim {
  if (input.outcome !== 'overridden') {
    if (input.rationale !== undefined) {
      throw new TypeError('Only an overridden Decision accepts an authored rationale');
    }
    return { mode: 'unspecified' };
  }
  if (input.rationale === undefined || input.rationale.trim().length === 0) {
    throw new TypeError('Override requires a non-empty authored rationale');
  }
  return {
    mode: 'authored',
    value: input.rationale.trim(),
    evidence: [],
  };
}

export function buildTransitionDecisionCommand(input: {
  outcome: RequestedDecisionOutcome;
  rationale?: string;
  precondition: TransitionReviewPrecondition;
  digestCanonicalRequest: (value: ProtocolValue) => string;
}): { requestFacts: ProtocolValue; requestDigest: string; reviewDigest: string } {
  const reviewDigest = digestTransitionReviewPrecondition(
    input.precondition,
    input.digestCanonicalRequest
  );
  if (
    input.precondition.reviewDigest !== undefined &&
    input.precondition.reviewDigest !== reviewDigest
  ) {
    throw new TransitionReviewStaleError();
  }
  const requestFacts: ProtocolValue = {
    operation: 'decide',
    outcome: input.outcome,
    ...(input.rationale === undefined ? {} : { rationale: input.rationale.trim() }),
    precondition: normalizedTransitionReviewPrecondition(input.precondition),
  };
  return {
    requestFacts,
    requestDigest: input.digestCanonicalRequest(requestFacts),
    reviewDigest,
  };
}

export function buildTransitionCommitCommand(input: {
  decisionDigest: string;
  expectedHead: string | null;
  workspaceProjectionFacts?: ProtocolValue;
  digestCanonicalRequest: (value: ProtocolValue) => string;
}): { requestFacts: ProtocolValue; requestDigest: string } {
  const requestFacts: ProtocolValue = {
    operation: 'commit',
    decision_digest: input.decisionDigest,
    expected_head: input.expectedHead,
    ...(input.workspaceProjectionFacts === undefined
      ? {}
      : { workspace_projection: input.workspaceProjectionFacts }),
  };
  return {
    requestFacts,
    requestDigest: input.digestCanonicalRequest(requestFacts),
  };
}

export function assertTransitionDecisionMembership(input: {
  decision: DecisionStatement;
  proposalDescriptor: { kind: string; schema: string; digest: string };
}): void {
  if (!sameDescriptor(input.decision.subjects[0]!, input.proposalDescriptor)) {
    throw new TransitionDecisionMembershipError(
      'Stored Decision does not bind this Transition Proposal membership'
    );
  }
}

export function assertTransitionReviewPrecondition(input: {
  precondition: TransitionReviewPrecondition;
  facts: {
    graph: TransitionInspectionGraph;
    workspaceRevision: number;
    refHead: string | null;
    policyDigest: string;
  };
}): void {
  const statementDigests = input.facts.graph.observations.map(
    (observation) => observation.membership.statementDigest
  );
  const membership = input.facts.graph.membership;
  if (
    input.precondition.workspaceRevision !== input.facts.workspaceRevision ||
    input.precondition.workspaceRevision !== membership.workspaceRevision ||
    input.precondition.refName !== membership.refName ||
    input.precondition.refHead !== membership.refHead ||
    input.precondition.refHead !== input.facts.refHead ||
    input.precondition.effectDigest !== membership.effectDigest ||
    input.precondition.proposalDigest !== membership.proposalDigest ||
    input.precondition.policyDigest !== input.facts.policyDigest ||
    !sameStringSet(input.precondition.statementDigests, statementDigests)
  ) {
    throw new TransitionReviewStaleError();
  }
}

export function sameTransitionPolicyResource(
  left: Pick<ResourceDescriptor, 'uri' | 'mediaType' | 'digest'>,
  right: Pick<ResourceDescriptor, 'uri' | 'mediaType' | 'digest'>
): boolean {
  return (
    left.uri === right.uri && left.mediaType === right.mediaType && left.digest === right.digest
  );
}

export function isGeneratedProposalPreparation(preparationFacts: ProtocolValue | null): boolean {
  return (
    preparationFacts !== null &&
    typeof preparationFacts === 'object' &&
    !Array.isArray(preparationFacts) &&
    preparationFacts.schema === PROPOSAL_GENERATION_PREPARATION_SCHEMA
  );
}
