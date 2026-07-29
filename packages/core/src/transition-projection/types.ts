import type {
  ActorRef,
  CommitDescriptor,
  CommitV2,
  DecisionPredicate,
  DecisionStatement,
  Effect,
  EffectDescriptor,
  EvidenceRef,
  MutationDriverRef,
  ObjectDescriptor,
  ProposalStatement,
  ProtocolValue,
  ResourceDescriptor,
  StateDescriptor,
  StatementDescriptor,
  StringClaim,
} from '@t3x-dev/transition';
import type { Commit } from '../commit/types';
import type { CommitHistoryProjection } from '../transition-commits/projection';
import type {
  ActorContext,
  PolicyFailureCode,
  StatementObservation,
} from '../transition-decisions/evaluation';
import type { AcceptancePolicy } from '../transition-decisions/policy';
import type { AssuranceReport, ObservationScope } from '../transition-statements/assurance';

export const TRANSITION_VIEW_SCHEMA = 't3x.dev/transition-view/v1' as const;

export type ClaimOrigin = 'request_source' | 'inferred' | 'actor_authored' | 'not_provided';

export type ClaimView =
  | {
      mode: 'unspecified';
      origin: 'not_provided';
      evidence: [];
    }
  | {
      mode: Exclude<StringClaim['mode'], 'unspecified'>;
      origin: Exclude<ClaimOrigin, 'not_provided'>;
      value: string;
      evidence: EvidenceRef[];
    };

export interface TransitionChecksView {
  objectIntegrity: AssuranceReport['objectIntegrity'];
  observationScope: AssuranceReport['observationScope'];
  replay: AssuranceReport['replay'];
  validation: AssuranceReport['validation'];
  humanConfirmation: AssuranceReport['humanConfirmation'];
}

export type TransitionDecisionView =
  | { observation: 'not_supplied' }
  | {
      observation: 'supplied';
      statement: StatementDescriptor;
      actor: ActorRef;
      outcome: DecisionPredicate['outcome'];
      policy: DecisionPredicate['policy'];
      considered: StatementDescriptor[];
      rationale: ClaimView;
      decidedAt: string;
    };

export type ProjectionCapabilityReasonCode =
  | PolicyFailureCode
  | 'COMMIT_ALREADY_SUPPLIED'
  | 'COMMIT_REQUIRED'
  | 'DECISION_ALREADY_SUPPLIED'
  | 'DECISION_REJECTED'
  | 'DECISION_REQUIRED'
  | 'LEGACY_HISTORY_READ_ONLY'
  | 'OVERRIDE_NOT_REQUIRED'
  | 'POLICY_CONTEXT_REQUIRED'
  | 'REPOSITORY_AUTHORIZATION_REQUIRED';

export interface ProjectionCapabilityReason {
  code: ProjectionCapabilityReasonCode;
  message: string;
}

export interface ActionCapabilityView {
  disposition: 'allowed' | 'denied' | 'not_applicable' | 'not_evaluated';
  reasons: ProjectionCapabilityReason[];
}

export interface TransitionCapabilitiesView {
  accept: ActionCapabilityView;
  override: ActionCapabilityView;
  reject: ActionCapabilityView;
  commit: ActionCapabilityView;
  revert: ActionCapabilityView;
}

export interface TransitionStatementAuditView {
  statement: StatementDescriptor;
  subjects: ObjectDescriptor[];
  predicateType: string;
  claimedActor: ActorRef;
  issuerActor: ActorRef;
}

export type TransitionHistoryView =
  | { observation: 'not_committed' }
  | {
      observation: 'committed';
      commit: Extract<CommitHistoryProjection, { format: 'transition_v2' }>;
    };

export interface TransitionGraphViewV1 {
  schema: typeof TRANSITION_VIEW_SCHEMA;
  version: 1;
  mode: 'transition';
  change: {
    effect: EffectDescriptor;
    base: StateDescriptor;
    result: StateDescriptor;
    driver: MutationDriverRef;
    operations: ProtocolValue[];
  };
  claims: {
    proposal: StatementDescriptor;
    actor: ActorRef;
    intent: ClaimView;
    rationale: ClaimView;
  };
  checks: TransitionChecksView;
  decision: TransitionDecisionView;
  history: TransitionHistoryView;
  capabilities: TransitionCapabilitiesView;
  audit: {
    effect: EffectDescriptor;
    proposal: StatementDescriptor;
    statements: TransitionStatementAuditView[];
    decision?: StatementDescriptor;
    commit?: CommitDescriptor;
  };
}

export interface LegacyTransitionViewV1 {
  schema: typeof TRANSITION_VIEW_SCHEMA;
  version: 1;
  mode: 'legacy';
  change: {
    mode: 'legacy_content';
    commitId: string;
    content: Commit['content'];
  };
  claims: { observation: 'unavailable'; reason: 'legacy_v1' };
  checks: { observation: 'unavailable'; reason: 'legacy_v1' };
  decision: { observation: 'unavailable'; reason: 'legacy_v1' };
  history: {
    observation: 'committed';
    commit: Extract<CommitHistoryProjection, { format: 'legacy_v1' }>;
  };
  capabilities: TransitionCapabilitiesView;
  audit: {
    format: 'legacy_v1';
    commitId: string;
    schema: Commit['schema'];
  };
}

export type TransitionViewV1 = TransitionGraphViewV1 | LegacyTransitionViewV1;

export interface ProjectionCapabilityContext {
  /** Trusted authenticated actor; never populated from request-shaped actor fields. */
  actorContext: ActorContext;
  /** Trusted project/ref policy content selected by the application. */
  policy: AcceptancePolicy;
  /** Descriptor for the exact trusted policy content. */
  policyResource: ResourceDescriptor;
}

export interface ProjectTransitionGraphInput {
  mode: 'transition';
  effect: Effect;
  proposal: ProposalStatement;
  observations: readonly StatementObservation[];
  observationScope: ObservationScope;
  objectIntegrity?: AssuranceReport['objectIntegrity'];
  decision?: DecisionStatement;
  commit?: {
    object: CommitV2;
    recordedAt: string;
  };
  capabilityContext?: ProjectionCapabilityContext;
}

export interface ProjectLegacyTransitionInput {
  mode: 'legacy';
  commit: Commit;
}

export type ProjectTransitionViewInput = ProjectTransitionGraphInput | ProjectLegacyTransitionInput;
