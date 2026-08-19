import {
  buildReplayVerificationStatement,
  COMMIT_V2_MEDIA_TYPE,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createHumanProposalDraft,
  createSemanticMergeEffect,
  createYOpsReplacementEffect,
  describeTransitionObject,
  emptyProposalReview,
  flattenTrees,
  type MergeDecision,
  type MergeSummaryData,
  type ProposalStatement,
  parseAcceptancePolicy,
  type RepositoryDecisionAuthority,
  type SemanticContent,
  type State,
  type StatementObservation,
} from '@t3x-dev/core';
import type {
  CanonicalTimestamp,
  Effect,
  EvidenceRef,
  ProtocolObject,
  StringClaim,
} from '@t3x-dev/transition';

export type RepositoryWriterActorRef = ProposalStatement['actor'];

export const REPOSITORY_STATE_REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-repository-yops-replay',
});

export const REPOSITORY_STATE_REPLAY_TOOL = Object.freeze({
  name: '@t3x-dev/core/yops-replay',
  version: '1',
});

export const REPOSITORY_MERGE_REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-repository-semantic-merge-replay',
});

export const REPOSITORY_MERGE_REPLAY_TOOL = Object.freeze({
  name: '@t3x-dev/core/yops-semantic-merge',
  version: '1',
});

const UNSPECIFIED_ENVIRONMENT = Object.freeze({ mode: 'unspecified' as const });

const REPOSITORY_STATE_OBSERVATION_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['server:repository-state-transition'],
});

const REPOSITORY_MERGE_OBSERVATION_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['server:repository-semantic-merge'],
});

export const REPOSITORY_STATE_POLICY = createAcceptancePolicyResource({
  uri: 't3x://policies/repository-state-transition/v1',
  policy: parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: true,
    },
    claims: {
      intent: {
        allowedModes: ['authored', 'unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored', 'inferred', 'unspecified'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'one_of', values: [REPOSITORY_STATE_REPLAY_ACTOR] },
        tools: { mode: 'one_of', values: [REPOSITORY_STATE_REPLAY_TOOL] },
        environments: { mode: 'one_of', values: [UNSPECIFIED_ENVIRONMENT] },
      },
      validation: {
        requirement: 'optional',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: true,
    },
  }),
});

export const REPOSITORY_MERGE_POLICY = createAcceptancePolicyResource({
  uri: 't3x://policies/repository-semantic-merge/v1',
  policy: parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: true,
    },
    claims: {
      intent: {
        allowedModes: ['authored'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['inferred'],
        minimumEvidence: 1,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'one_of', values: [REPOSITORY_MERGE_REPLAY_ACTOR] },
        tools: { mode: 'one_of', values: [REPOSITORY_MERGE_REPLAY_TOOL] },
        environments: { mode: 'one_of', values: [UNSPECIFIED_ENVIRONMENT] },
      },
      validation: {
        requirement: 'optional',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: true,
    },
  }),
});

export class RepositoryStateProposalError extends Error {
  readonly code = 'PROPOSAL_INVALID';

  constructor(readonly issues: readonly { code: string; path: string; message: string }[]) {
    super('Repository State Proposal could not be compiled');
    this.name = 'RepositoryStateProposalError';
  }
}

export class RepositoryStateDecisionDeniedError extends Error {
  readonly code = 'DECISION_NOT_PERMITTED';

  constructor(readonly failures: readonly { code: string; message: string }[]) {
    super('Repository State Decision was denied by the server policy');
    this.name = 'RepositoryStateDecisionDeniedError';
  }
}

export interface PreparedRepositoryTransitionWrite {
  proposal: ProposalStatement;
  effect: Effect;
  result: State;
  rationale: StringClaim;
  decidedAt: CanonicalTimestamp;
  authority: RepositoryDecisionAuthority;
  parents: readonly CommitV2[];
  objects: readonly ProtocolObject[];
  yopsLogIds?: readonly string[];
}

export interface PrepareRepositoryYOpsStateWriteInput {
  projectId: string;
  refName: string;
  expectedHead: string | null;
  base: State;
  target: State;
  parentCommit?: CommitV2;
  actor: RepositoryWriterActorRef;
  intent?: string;
  rationale?: string;
  evidence?: readonly EvidenceRef[];
  yopsLogIds?: readonly string[];
  recordedAt: CanonicalTimestamp;
}

export interface PreparedRepositoryYOpsStateWrite extends PreparedRepositoryTransitionWrite {}

export interface PrepareRepositoryYOpsMergeWriteInput {
  projectId: string;
  refName: string;
  sourceDigest: string;
  targetDigest: string;
  sourceState: State;
  targetState: State;
  mergeBaseState: State;
  sourceCommit: CommitV2;
  targetCommit: CommitV2;
  decisions: MergeDecision;
  actor: RepositoryWriterActorRef;
  message: string;
  recordedAt: CanonicalTimestamp;
}

export interface PreparedRepositoryYOpsMergeWrite extends PreparedRepositoryTransitionWrite {
  content: SemanticContent;
  mergeSummary: MergeSummaryData;
}

function createRepositoryDecisionAuthority(input: {
  actor: RepositoryWriterActorRef;
  observations: readonly StatementObservation[];
  policy: typeof REPOSITORY_STATE_POLICY | typeof REPOSITORY_MERGE_POLICY;
  sources: readonly string[];
}): RepositoryDecisionAuthority {
  return {
    async resolve() {
      return {
        actorContext: { actor: input.actor },
        observationScope: {
          completeness: 'complete',
          sources: [...input.sources],
        },
        policy: input.policy.policy,
        policyResource: input.policy.resource,
        statements: input.observations,
      };
    },
  };
}

function normalizeAuthoredText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function prepareRepositoryYOpsStateWrite(
  input: PrepareRepositoryYOpsStateWriteInput
): PreparedRepositoryYOpsStateWrite {
  const { effect, result } = createYOpsReplacementEffect({
    base: input.base,
    target: input.target,
    expectedBase: describeTransitionObject(input.base),
  });
  const proposalDraft = createHumanProposalDraft({
    ...(normalizeAuthoredText(input.intent) === undefined
      ? {}
      : { intent: normalizeAuthoredText(input.intent) }),
    ...(normalizeAuthoredText(input.rationale) === undefined
      ? {}
      : { why: normalizeAuthoredText(input.rationale) }),
  });
  const evidence: EvidenceRef[] = structuredClone([...(input.evidence ?? [])]);
  if (evidence.length > 0) {
    proposalDraft.rationale =
      proposalDraft.rationale.mode === 'unspecified'
        ? {
            mode: 'inferred',
            value: 'Repository state was derived from immutable source evidence.',
            evidence,
          }
        : { ...proposalDraft.rationale, evidence };
  }
  const compiled = compileProposalDraft({
    draft: proposalDraft,
    effect,
    actor: input.actor,
  });
  if (!compiled.ok) throw new RepositoryStateProposalError(compiled.issues);

  const replay = buildReplayVerificationStatement({
    effect,
    actor: REPOSITORY_STATE_REPLAY_ACTOR,
    predicate: {
      outcome: 'verified',
      result: effect.result,
      tool: REPOSITORY_STATE_REPLAY_TOOL,
      run: {
        id: `repository:${input.projectId}:ref:${input.refName}:base:${input.expectedHead ?? 'empty'}:replay`,
        recordedAt: input.recordedAt,
      },
      environment: UNSPECIFIED_ENVIRONMENT,
    },
  });
  const observations: StatementObservation[] = [
    { statement: replay, issuerContext: { actor: REPOSITORY_STATE_REPLAY_ACTOR } },
  ];
  const parents = input.parentCommit === undefined ? [] : [input.parentCommit];
  return {
    proposal: compiled.proposal,
    effect,
    result,
    rationale: normalizeAuthoredText(input.rationale)
      ? {
          mode: 'authored',
          value: normalizeAuthoredText(input.rationale)!,
          evidence: [],
        }
      : { mode: 'unspecified' },
    decidedAt: input.recordedAt,
    authority: createRepositoryDecisionAuthority({
      actor: input.actor,
      observations,
      policy: REPOSITORY_STATE_POLICY,
      sources: REPOSITORY_STATE_OBSERVATION_SCOPE.sources,
    }),
    parents,
    objects: [input.base, result, ...parents],
    ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: [...input.yopsLogIds] }),
  };
}

export function prepareRepositoryYOpsMergeWrite(
  input: PrepareRepositoryYOpsMergeWriteInput
): PreparedRepositoryYOpsMergeWrite {
  const merged = createSemanticMergeEffect({
    target: input.targetState,
    mergeBase: input.mergeBaseState,
    source: input.sourceState,
    decisions: input.decisions,
    expectedTarget: input.targetCommit.result,
  });
  const sourceEvidence = {
    resource: {
      uri: `t3x://projects/${input.projectId}/commits/${input.sourceDigest}`,
      mediaType: COMMIT_V2_MEDIA_TYPE,
      digest: input.sourceDigest as `sha256:${string}`,
    },
    locator: {
      scheme: 't3x.protocol-object/v1',
      value: { kind: 'commit', role: 'merge-source' },
    },
  };
  const compiled = compileProposalDraft({
    draft: {
      schema: 't3x/proposal-draft',
      version: 1,
      intent: { mode: 'authored', value: input.message, evidence: [] },
      rationale: {
        mode: 'inferred',
        value: `Merge CommitV2 ${input.sourceDigest} into ${input.targetDigest} using the pinned semantic merge driver.`,
        evidence: [sourceEvidence],
      },
      review: emptyProposalReview(),
    },
    effect: merged.effect,
    actor: input.actor,
  });
  if (!compiled.ok) throw new RepositoryStateProposalError(compiled.issues);

  const replay = buildReplayVerificationStatement({
    effect: merged.effect,
    actor: REPOSITORY_MERGE_REPLAY_ACTOR,
    predicate: {
      outcome: 'verified',
      result: merged.effect.result,
      tool: REPOSITORY_MERGE_REPLAY_TOOL,
      run: {
        id: `repository:${input.projectId}:ref:${input.refName}:target:${input.targetDigest}:source:${input.sourceDigest}:merge-replay`,
        recordedAt: input.recordedAt,
      },
      environment: UNSPECIFIED_ENVIRONMENT,
    },
  });
  const observations: StatementObservation[] = [
    { statement: replay, issuerContext: { actor: REPOSITORY_MERGE_REPLAY_ACTOR } },
  ];
  const keptFromSource = new Set(input.decisions.keepFromSource).size;
  const keptFromTarget = new Set(input.decisions.keepFromTarget).size;
  return {
    proposal: compiled.proposal,
    effect: merged.effect,
    result: merged.result,
    rationale: { mode: 'unspecified' },
    decidedAt: input.recordedAt,
    authority: createRepositoryDecisionAuthority({
      actor: input.actor,
      observations,
      policy: REPOSITORY_MERGE_POLICY,
      sources: REPOSITORY_MERGE_OBSERVATION_SCOPE.sources,
    }),
    parents: [input.targetCommit, input.sourceCommit],
    objects: [
      input.targetState,
      input.sourceState,
      input.mergeBaseState,
      merged.result,
      input.targetCommit,
      input.sourceCommit,
    ],
    content: merged.content,
    mergeSummary: {
      kept_identical: merged.prepared.autoKept.length,
      resolved_conflicts: merged.prepared.conflicts.length,
      kept_from_source: keptFromSource,
      kept_from_target: keptFromTarget,
      discarded:
        merged.prepared.onlyInSource.length -
        keptFromSource +
        (merged.prepared.onlyInTarget.length - keptFromTarget),
      total_nodes: flattenTrees(merged.content.trees).length,
    },
  };
}
