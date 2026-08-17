import {
  type AcceptancePolicy,
  type ProjectionCapabilityContext,
  type ProposalStatement,
  projectTransitionView,
  type TransitionViewV1,
} from '@t3x-dev/core';
import type {
  DecisionStatement,
  Effect,
  ObjectDescriptor,
  ProtocolValue,
  ResourceDescriptor,
  State,
  Statement,
} from '@t3x-dev/transition';

export type TransitionActorRef = ProposalStatement['actor'];

export type TransitionRequestKind =
  | 'structured_yops'
  | 'exact_source_import'
  | 'exact_source_edit'
  | 'exact_source_revert';

export interface TransitionInspectionGraph {
  membership: {
    transitionId: string;
    projectId: string;
    workspaceId: string;
    workspaceRevision: number;
    refName: string;
    refHead: string | null;
    requestKind: TransitionRequestKind;
    requestId: string;
    effectDigest: string;
    proposalDigest: string;
    createdAt: string;
  };
  preparation: { canonicalJson: string } | null;
  base: State;
  result: State;
  effect: Effect;
  proposal: ProposalStatement;
  observations: Array<{
    membership: {
      statementDigest: string;
      source: string;
      issuer: TransitionActorRef;
      requestId: string;
      createdAt: string;
    };
    statement: Statement<string, unknown, ObjectDescriptor[]>;
    issuerContext: { actor: TransitionActorRef };
  }>;
}

export interface TransitionPolicyBindingLike {
  policy: AcceptancePolicy;
  resource: ResourceDescriptor & {
    mediaType: 'application/vnd.t3x.acceptance-policy+json';
    digest: `sha256:${string}`;
  };
}

export interface ApplicableTransitionPolicyLike {
  policy: ProjectionCapabilityContext['policy'];
  resource: ProjectionCapabilityContext['policyResource'];
}

export interface TransitionInspectionPorts<GenerationProjection = unknown> {
  resolveTransitionProposalGraph(input: {
    projectId: string;
    transitionId: string;
  }): Promise<TransitionInspectionGraph>;
  getTransitionPolicyBinding(input: {
    projectId: string;
    refName: string;
  }): Promise<TransitionPolicyBindingLike | null>;
  resolveApplicableTransitionPolicy(input: {
    refPolicyBinding: TransitionPolicyBindingLike;
    requestKind: TransitionRequestKind;
    preparationFacts: ProtocolValue | null;
  }): ApplicableTransitionPolicyLike;
  projectProposalGenerationReview(input: {
    preparationFacts: ProtocolValue | null;
    operations: ProtocolValue[];
    base: ProtocolValue;
    result: ProtocolValue;
    observations: ReadonlyArray<{
      statement: Statement<string, unknown, ObjectDescriptor[]>;
      source: string;
      issuer: TransitionActorRef;
    }>;
  }): GenerationProjection | null;
}

export interface InspectTransitionInput {
  projectId: string;
  transitionId: string;
  actor?: TransitionActorRef;
  decision?: DecisionStatement;
}

export interface TransitionInspectionView<GenerationProjection = unknown> {
  transitionId: string;
  projectId: string;
  workspaceId: string;
  requestKind: TransitionRequestKind;
  requestId: string;
  createdAt: string;
  precondition: {
    workspaceRevision: number;
    refName: string;
    refHead: string | null;
    effectDigest: string;
    proposalDigest: string;
    statementDigests: string[];
    policyDigest: string | null;
  };
  transition: TransitionViewV1;
  statements: Array<{
    digest: string;
    source: string;
    issuer: TransitionActorRef;
    requestId: string;
    createdAt: string;
  }>;
  generation?: GenerationProjection;
}

const REPOSITORY_OBSERVATION_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['repository:transition-statement-memberships'],
});

export async function inspectTransition<GenerationProjection = unknown>(
  input: InspectTransitionInput,
  ports: TransitionInspectionPorts<GenerationProjection>
): Promise<TransitionInspectionView<GenerationProjection>> {
  const graph = await ports.resolveTransitionProposalGraph({
    projectId: input.projectId,
    transitionId: input.transitionId,
  });
  const policyBinding = await ports.getTransitionPolicyBinding({
    projectId: input.projectId,
    refName: graph.membership.refName,
  });
  const preparationFacts =
    graph.preparation === null
      ? null
      : (JSON.parse(graph.preparation.canonicalJson) as ProtocolValue);
  const applicablePolicy =
    policyBinding === null
      ? null
      : ports.resolveApplicableTransitionPolicy({
          refPolicyBinding: policyBinding,
          requestKind: graph.membership.requestKind,
          preparationFacts,
        });
  const capabilityContext: ProjectionCapabilityContext | undefined =
    input.actor === undefined || applicablePolicy === null
      ? undefined
      : {
          actorContext: { actor: input.actor },
          policy: applicablePolicy.policy,
          policyResource: applicablePolicy.resource,
        };
  const transition = projectTransitionView({
    mode: 'transition',
    effect: graph.effect,
    proposal: graph.proposal,
    observations: graph.observations.map((observation) => ({
      statement: observation.statement as Statement,
      issuerContext: observation.issuerContext,
    })),
    observationScope: REPOSITORY_OBSERVATION_SCOPE,
    objectIntegrity: 'verified',
    ...(input.decision === undefined ? {} : { decision: input.decision }),
    ...(capabilityContext === undefined ? {} : { capabilityContext }),
  });
  const generation = ports.projectProposalGenerationReview({
    preparationFacts,
    operations: graph.effect.operations,
    base: graph.base.value,
    result: graph.result.value,
    observations: graph.observations.map((observation) => ({
      statement: observation.statement as Statement,
      source: observation.membership.source,
      issuer: observation.issuerContext.actor,
    })),
  });

  return {
    transitionId: graph.membership.transitionId,
    projectId: graph.membership.projectId,
    workspaceId: graph.membership.workspaceId,
    requestKind: graph.membership.requestKind,
    requestId: graph.membership.requestId,
    createdAt: graph.membership.createdAt,
    precondition: {
      workspaceRevision: graph.membership.workspaceRevision,
      refName: graph.membership.refName,
      refHead: graph.membership.refHead,
      effectDigest: graph.membership.effectDigest,
      proposalDigest: graph.membership.proposalDigest,
      statementDigests: graph.observations.map(
        (observation) => observation.membership.statementDigest
      ),
      policyDigest: applicablePolicy?.resource.digest ?? null,
    },
    transition,
    statements: graph.observations.map((observation) => ({
      digest: observation.membership.statementDigest,
      source: observation.membership.source,
      issuer: observation.membership.issuer,
      requestId: observation.membership.requestId,
      createdAt: observation.membership.createdAt,
    })),
    ...(generation === null ? {} : { generation }),
  };
}
