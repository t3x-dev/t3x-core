import {
  type AcceptancePolicy,
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
  ResourceDescriptor,
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

export interface RepositoryWriterPolicyBinding {
  readonly policy: AcceptancePolicy;
  readonly resource: ResourceDescriptor;
}

export interface RepositoryWriterServerPolicyBindingExpectation {
  readonly expected: RepositoryWriterPolicyBinding | null;
  readonly required: boolean;
}

export interface PreparedRepositoryTransitionTarget {
  readonly projectId: string;
  readonly refName: string;
  readonly expectedHead: string | null;
}

export interface PreparedRepositoryTransitionWrite {
  readonly target: PreparedRepositoryTransitionTarget;
  readonly proposal: ProposalStatement;
  readonly effect: Effect;
  readonly result: State;
  readonly rationale: StringClaim;
  readonly decidedAt: CanonicalTimestamp;
  readonly authority: RepositoryDecisionAuthority;
  readonly parents: readonly CommitV2[];
  readonly objects: readonly ProtocolObject[];
  readonly yopsLogIds?: readonly string[];
  readonly serverPolicyBindingExpectation?: RepositoryWriterServerPolicyBindingExpectation;
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
  policyBinding: RepositoryWriterPolicyBinding;
  serverPolicyBindingExpectation?: RepositoryWriterServerPolicyBindingExpectation;
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
  policyBinding: RepositoryWriterPolicyBinding;
  serverPolicyBindingExpectation?: RepositoryWriterServerPolicyBindingExpectation;
  recordedAt: CanonicalTimestamp;
}

export interface PreparedRepositoryYOpsMergeWrite extends PreparedRepositoryTransitionWrite {
  content: SemanticContent;
  mergeSummary: MergeSummaryData;
}

function createRepositoryDecisionAuthority(input: {
  target: PreparedRepositoryTransitionTarget;
  proposal: ProposalStatement;
  effect: Effect;
  actor: RepositoryWriterActorRef;
  observations: readonly StatementObservation[];
  policyBinding: RepositoryWriterPolicyBinding;
  sources: readonly string[];
}): RepositoryDecisionAuthority {
  const proposalDescriptor = describeTransitionObject(input.proposal);
  const effectDescriptor = describeTransitionObject(input.effect);
  const actor = immutableSnapshot(input.actor);
  const observations = immutableSnapshot(input.observations);
  const policyBinding = immutableSnapshot(input.policyBinding);
  const authority: RepositoryDecisionAuthority = {
    async resolve(request) {
      if (request.projectId !== input.target.projectId) {
        throw new TypeError(
          'Prepared repository Decision authority cannot be reused for a different project'
        );
      }
      if (request.refName !== input.target.refName) {
        throw new TypeError(
          'Prepared repository Decision authority cannot be reused for a different ref'
        );
      }
      if (!sameDescriptor(describeTransitionObject(request.proposal), proposalDescriptor)) {
        throw new TypeError(
          'Prepared repository Decision authority cannot be reused for a different Proposal'
        );
      }
      if (!sameDescriptor(describeTransitionObject(request.effect), effectDescriptor)) {
        throw new TypeError(
          'Prepared repository Decision authority cannot be reused for a different Effect'
        );
      }
      return {
        actorContext: { actor },
        observationScope: {
          completeness: 'complete',
          sources: [...input.sources],
        },
        policy: policyBinding.policy,
        policyResource: policyBinding.resource,
        statements: observations,
      };
    },
  };
  return Object.freeze(authority);
}

const PREPARED_REPOSITORY_WRITE_BY_AUTHORITY = new WeakMap<
  RepositoryDecisionAuthority,
  PreparedRepositoryTransitionWrite
>();

function bindPreparedRepositoryTransitionWrite<T extends PreparedRepositoryTransitionWrite>(
  prepared: T
): T {
  PREPARED_REPOSITORY_WRITE_BY_AUTHORITY.set(prepared.authority, prepared);
  return prepared;
}

/**
 * Prove that a commit boundary received the exact target capability issued
 * alongside this prepared authority, rather than a structurally forged target.
 */
export function assertPreparedRepositoryTransitionAuthorityTarget(input: {
  authority: RepositoryDecisionAuthority;
  target: PreparedRepositoryTransitionTarget;
}): void {
  if (PREPARED_REPOSITORY_WRITE_BY_AUTHORITY.get(input.authority)?.target !== input.target) {
    throw new TypeError(
      'Prepared repository Decision authority requires its exact prepared target'
    );
  }
}

/** Prove that every commit-consumed value came from the same prepared write. */
export function assertPreparedRepositoryTransitionAuthorityBundle(input: {
  authority: RepositoryDecisionAuthority;
  target: PreparedRepositoryTransitionTarget;
  proposal: ProposalStatement;
  effect: Effect;
  rationale: StringClaim;
  decidedAt: CanonicalTimestamp;
  parents: readonly CommitV2[];
  objects: readonly ProtocolObject[];
  yopsLogIds?: readonly string[];
  serverPolicyBindingExpectation?: RepositoryWriterServerPolicyBindingExpectation;
}): void {
  const prepared = PREPARED_REPOSITORY_WRITE_BY_AUTHORITY.get(input.authority);
  if (
    prepared === undefined ||
    prepared.target !== input.target ||
    prepared.proposal !== input.proposal ||
    prepared.effect !== input.effect ||
    prepared.rationale !== input.rationale ||
    prepared.decidedAt !== input.decidedAt ||
    prepared.parents !== input.parents ||
    prepared.objects !== input.objects ||
    prepared.yopsLogIds !== input.yopsLogIds ||
    prepared.serverPolicyBindingExpectation !== input.serverPolicyBindingExpectation
  ) {
    throw new TypeError(
      'Prepared repository Decision authority requires its exact prepared write bundle'
    );
  }
}

function sameDescriptor(
  left: { kind: string; schema: string; digest: string },
  right: { kind: string; schema: string; digest: string }
): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

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

function normalizeAuthoredText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function prepareRepositoryYOpsStateWrite(
  input: PrepareRepositoryYOpsStateWriteInput
): PreparedRepositoryYOpsStateWrite {
  const actor = immutableSnapshot(input.actor);
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
    actor,
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
  const preparedTarget = Object.freeze({
    projectId: input.projectId,
    refName: input.refName,
    expectedHead: input.expectedHead,
  });
  const rationale: StringClaim = normalizeAuthoredText(input.rationale)
    ? {
        mode: 'authored',
        value: normalizeAuthoredText(input.rationale)!,
        evidence: [],
      }
    : { mode: 'unspecified' };
  const graph: Omit<PreparedRepositoryYOpsStateWrite, 'target' | 'authority'> = immutableSnapshot({
    proposal: compiled.proposal,
    effect,
    result,
    rationale,
    decidedAt: input.recordedAt,
    parents,
    objects: [input.base, result, ...parents],
    ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: [...input.yopsLogIds] }),
    ...(input.serverPolicyBindingExpectation === undefined
      ? {}
      : { serverPolicyBindingExpectation: input.serverPolicyBindingExpectation }),
  });
  const authority = createRepositoryDecisionAuthority({
    target: preparedTarget,
    proposal: graph.proposal,
    effect: graph.effect,
    actor: graph.proposal.actor,
    observations,
    policyBinding: input.policyBinding,
    sources: REPOSITORY_STATE_OBSERVATION_SCOPE.sources,
  });
  return bindPreparedRepositoryTransitionWrite(
    Object.freeze({
      target: preparedTarget,
      ...graph,
      authority,
    })
  );
}

export function prepareRepositoryYOpsMergeWrite(
  input: PrepareRepositoryYOpsMergeWriteInput
): PreparedRepositoryYOpsMergeWrite {
  const actor = immutableSnapshot(input.actor);
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
    actor,
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
  const preparedTarget = Object.freeze({
    projectId: input.projectId,
    refName: input.refName,
    expectedHead: input.targetDigest,
  });
  const graph: Omit<PreparedRepositoryYOpsMergeWrite, 'target' | 'authority'> = immutableSnapshot({
    proposal: compiled.proposal,
    effect: merged.effect,
    result: merged.result,
    rationale: { mode: 'unspecified' as const },
    decidedAt: input.recordedAt,
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
    ...(input.serverPolicyBindingExpectation === undefined
      ? {}
      : { serverPolicyBindingExpectation: input.serverPolicyBindingExpectation }),
  });
  const authority = createRepositoryDecisionAuthority({
    target: preparedTarget,
    proposal: graph.proposal,
    effect: graph.effect,
    actor: graph.proposal.actor,
    observations,
    policyBinding: input.policyBinding,
    sources: REPOSITORY_MERGE_OBSERVATION_SCOPE.sources,
  });
  return bindPreparedRepositoryTransitionWrite(
    Object.freeze({
      target: preparedTarget,
      ...graph,
      authority,
    })
  );
}
