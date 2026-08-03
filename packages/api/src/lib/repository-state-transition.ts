import {
  authorizeDecisionForRepository,
  buildReplayVerificationStatement,
  COMMIT_V2_MEDIA_TYPE,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createCommitV2,
  createHumanProposalDraft,
  createRepositorySemanticState,
  createSemanticMergeEffect,
  createYOpsReplacementEffect,
  createYOpsState,
  decodeRepositorySemanticState,
  describeCommitV2,
  describeTransitionObject,
  emptyProposalReview,
  flattenTrees,
  InMemoryTransitionObjectResolver,
  type MergeDecision,
  type MergeResult,
  type MergeSummaryData,
  type ProposalStatement,
  type ProtocolObject,
  parseAcceptancePolicy,
  prepareMerge,
  type RepositoryDecisionAuthority,
  type SemanticContent,
  type State,
  type StatementObservation,
  sha256,
  type TransitionViewV1,
} from '@t3x-dev/core';
import {
  type AnyDB,
  createTransitionCommit,
  findConversationById,
  findTurnsByConversation,
  getTransitionRefHead,
  getTransitionViewForCommit,
  getVerifiedTransitionCommitGraph,
  listTransitionCommitProjectIds,
  recordRepositoryDecisionAuthorization,
  TransitionHeadConflictError,
  type VerifiedTransitionCommitGraph,
} from '@t3x-dev/storage';
import type { EvidenceRef } from '@t3x-dev/transition';

type ActorRef = ProposalStatement['actor'];
type CanonicalTimestamp = Parameters<typeof authorizeDecisionForRepository>[0]['decidedAt'];

const REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-repository-yops-replay',
});
const REPLAY_TOOL = Object.freeze({ name: '@t3x-dev/core/yops-replay', version: '1' });
const MERGE_REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-repository-semantic-merge-replay',
});
const MERGE_REPLAY_TOOL = Object.freeze({
  name: '@t3x-dev/core/yops-semantic-merge',
  version: '1',
});
const UNSPECIFIED_ENVIRONMENT = Object.freeze({ mode: 'unspecified' as const });
const OBSERVATION_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['server:repository-state-transition'],
});
const REPOSITORY_STATE_POLICY = createAcceptancePolicyResource({
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
        issuers: { mode: 'one_of', values: [REPLAY_ACTOR] },
        tools: { mode: 'one_of', values: [REPLAY_TOOL] },
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

const REPOSITORY_MERGE_POLICY = createAcceptancePolicyResource({
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
        issuers: { mode: 'one_of', values: [MERGE_REPLAY_ACTOR] },
        tools: { mode: 'one_of', values: [MERGE_REPLAY_TOOL] },
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

export interface CommitRepositoryYOpsStateInput {
  db: AnyDB;
  projectId: string;
  refName: string;
  /** Exact head observed by the application command; never inferred inside the write. */
  expectedHead: string | null;
  target: State;
  /** Trusted server-derived actor, never copied from a request body. */
  actor: ActorRef;
  intent?: string;
  rationale?: string;
  /** Server-resolved immutable source provenance for the Proposal claims. */
  evidence?: readonly EvidenceRef[];
  yopsLogIds?: readonly string[];
}

export interface CommitRepositoryYOpsStateResult {
  commit: CommitV2;
  commitDigest: string;
  transition: TransitionViewV1;
}

export class RepositoryStateDomainUnsupportedError extends Error {
  readonly code = 'UNSUPPORTED_DOMAIN';

  constructor(message: string) {
    super(message);
    this.name = 'RepositoryStateDomainUnsupportedError';
  }
}

export class RepositoryCommitMembershipAmbiguousError extends Error {
  readonly code = 'COMMIT_MEMBERSHIP_AMBIGUOUS';

  constructor(
    readonly digest: string,
    readonly projectIds: readonly string[]
  ) {
    super(`Commit ${digest} belongs to multiple projects; an explicit project is required`);
    this.name = 'RepositoryCommitMembershipAmbiguousError';
  }
}

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

/** Losslessly encode structured repository content in the versioned YOps State domain. */
export function createRepositoryYOpsStateFromSemanticContent(content: SemanticContent): State {
  return createRepositorySemanticState(content);
}

/** Resolve one conversation into immutable turn-level Proposal EvidenceRefs. */
export async function getRepositoryConversationEvidence(
  db: AnyDB,
  projectId: string,
  conversationId: string
): Promise<EvidenceRef[]> {
  const conversation = await findConversationById(db, conversationId);
  if (conversation === null || conversation.projectId !== projectId) return [];
  const turns = await findTurnsByConversation(db, {
    conversationId,
    order: 'asc',
    limit: 10_000,
    offset: 0,
  });
  return turns.map((turn) => ({
    resource: {
      uri: `t3x://projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turn.turnHash)}`,
      mediaType: 'text/plain;charset=utf-8',
      digest: `sha256:${sha256(turn.content)}` as `sha256:${string}`,
    },
    locator: {
      scheme: 't3x.text-quote/v1',
      value: { quote: turn.content },
    },
  }));
}

/** Decode only the repository SemanticContent domain; never guess another State shape. */
export function decodeRepositorySemanticContentState(state: State): SemanticContent {
  try {
    return decodeRepositorySemanticState(state);
  } catch (error) {
    throw new RepositoryStateDomainUnsupportedError(
      error instanceof Error
        ? error.message
        : 'State is not a t3x.dev/semantic-content version 1 YOps document'
    );
  }
}

export interface RepositorySemanticCommitProjection {
  digest: string;
  projectId: string;
  schema: CommitV2['schema'];
  parents: string[];
  actor: ActorRef;
  recordedAt: string;
  intent: string | null;
  rationale: string | null;
  evidence: EvidenceRef[];
  semanticContent: SemanticContent;
}

function claimValue(claim: ProposalStatement['predicate']['intent']): string | null {
  return claim.mode === 'unspecified' ? null : claim.value;
}

function claimEvidence(claim: ProposalStatement['predicate']['intent']): EvidenceRef[] {
  return claim.mode === 'unspecified' ? [] : structuredClone(claim.evidence);
}

/** Resolve one verified CommitV2 through the explicit repository semantic State codec. */
export async function getRepositorySemanticCommit(
  db: AnyDB,
  digest: string,
  projectId?: string
): Promise<RepositorySemanticCommitProjection | null> {
  let resolvedProjectId = projectId;
  if (resolvedProjectId === undefined) {
    const projectIds = await listTransitionCommitProjectIds(db, digest);
    if (projectIds.length === 0) return null;
    if (projectIds.length !== 1) {
      throw new RepositoryCommitMembershipAmbiguousError(digest, projectIds);
    }
    resolvedProjectId = projectIds[0];
  }
  const graph = await getVerifiedTransitionCommitGraph(db, resolvedProjectId, digest);
  if (graph === null) return null;
  return {
    digest,
    projectId: resolvedProjectId,
    schema: graph.commit.schema,
    parents: graph.commit.parents.map((parent) => parent.digest),
    actor: { ...graph.proposal.actor },
    recordedAt: graph.recordedAt,
    intent: claimValue(graph.proposal.predicate.intent),
    rationale: claimValue(graph.proposal.predicate.rationale),
    evidence: [
      ...claimEvidence(graph.proposal.predicate.intent),
      ...claimEvidence(graph.proposal.predicate.rationale),
    ],
    semanticContent: decodeRepositorySemanticContentState(graph.state),
  };
}

/**
 * Persist one complete YOps repository state-change graph and advance its ref.
 *
 * This is the shared one-shot application path for task-oriented commands that
 * already have an exact target State. It always creates Effect, Proposal,
 * deterministic replay Statement, accepted Decision, CommitV2, and an
 * expected-head ref CAS. External systems and protocol storage stay outside
 * the deterministic mutation driver.
 */
export async function commitRepositoryYOpsState(
  input: CommitRepositoryYOpsStateInput
): Promise<CommitRepositoryYOpsStateResult> {
  const head = await getTransitionRefHead(input.db, {
    projectId: input.projectId,
    refName: input.refName,
  });
  if (head.head !== input.expectedHead) {
    throw new TransitionHeadConflictError(input.expectedHead, head.head);
  }

  const base = head.format === 'empty' ? createYOpsState({}) : head.state;
  const { effect, result } = createYOpsReplacementEffect({
    base,
    target: input.target,
    expectedBase: describeTransitionObject(base),
  });
  const proposalDraft = createHumanProposalDraft({
    ...(input.intent?.trim() ? { intent: input.intent.trim() } : {}),
    ...(input.rationale?.trim() ? { why: input.rationale.trim() } : {}),
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

  const recordedAt = new Date().toISOString() as CanonicalTimestamp;
  const replay = buildReplayVerificationStatement({
    effect,
    actor: REPLAY_ACTOR,
    predicate: {
      outcome: 'verified',
      result: effect.result,
      tool: REPLAY_TOOL,
      run: {
        id: `repository:${input.projectId}:ref:${input.refName}:base:${input.expectedHead ?? 'empty'}:replay`,
        recordedAt,
      },
      environment: UNSPECIFIED_ENVIRONMENT,
    },
  });
  const observations: StatementObservation[] = [
    { statement: replay, issuerContext: { actor: REPLAY_ACTOR } },
  ];
  const authority: RepositoryDecisionAuthority = {
    async resolve() {
      return {
        actorContext: { actor: input.actor },
        observationScope: OBSERVATION_SCOPE,
        policy: REPOSITORY_STATE_POLICY.policy,
        policyResource: REPOSITORY_STATE_POLICY.resource,
        statements: observations,
      };
    },
  };
  const issued = await authorizeDecisionForRepository({
    projectId: input.projectId,
    refName: input.refName,
    proposal: compiled.proposal,
    effect,
    outcome: 'accepted',
    rationale: input.rationale?.trim()
      ? { mode: 'authored', value: input.rationale.trim(), evidence: [] }
      : { mode: 'unspecified' },
    decidedAt: recordedAt,
    authority,
  });
  if (!issued.ok || issued.authorization === null) {
    throw new RepositoryStateDecisionDeniedError(issued.ok ? [] : issued.failures);
  }

  await recordRepositoryDecisionAuthorization(input.db, issued.authorization);
  const parentObjects = head.format === 'transition_v2' ? [head.commit] : [];
  const objects: ProtocolObject[] = [
    base,
    result,
    ...issued.authorization.objects,
    ...parentObjects,
  ];
  const commit = await createCommitV2({
    parents: head.format === 'transition_v2' ? [describeCommitV2(head.commit)] : [],
    decision: issued.decision,
    resolver: new InMemoryTransitionObjectResolver(objects),
  });
  const created = await createTransitionCommit(input.db, {
    projectId: input.projectId,
    refName: input.refName,
    expectedHead: input.expectedHead,
    commit,
    objects,
    ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: input.yopsLogIds }),
  });
  const transition = await getTransitionViewForCommit(input.db, {
    projectId: input.projectId,
    refName: input.refName,
    commitId: created.digest,
  });
  if (transition === null) {
    throw new TypeError('Committed repository Transition could not be resolved');
  }
  return { commit, commitDigest: created.digest, transition };
}

export class RepositoryMergeCommitNotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(readonly digest: string) {
    super(`CommitV2 not found in project: ${digest}`);
    this.name = 'RepositoryMergeCommitNotFoundError';
  }
}

export class RepositoryMergeInvalidError extends Error {
  readonly code = 'INVALID_REQUEST';

  constructor(message: string) {
    super(message);
    this.name = 'RepositoryMergeInvalidError';
  }
}

interface CommitDistance {
  graph: VerifiedTransitionCommitGraph;
  distance: number;
}

interface RepositoryMergeContext {
  source: VerifiedTransitionCommitGraph;
  target: VerifiedTransitionCommitGraph;
  mergeBaseState: State;
  prepared: MergeResult;
}

async function loadRepositoryMergeContext(input: {
  db: AnyDB;
  projectId: string;
  sourceDigest: string;
  targetDigest: string;
}): Promise<RepositoryMergeContext> {
  if (input.sourceDigest === input.targetDigest) {
    throw new RepositoryMergeInvalidError('Source and target CommitV2 must be different');
  }
  const cache = new Map<string, VerifiedTransitionCommitGraph>();
  const load = async (digest: string): Promise<VerifiedTransitionCommitGraph> => {
    const cached = cache.get(digest);
    if (cached !== undefined) return cached;
    const graph = await getVerifiedTransitionCommitGraph(input.db, input.projectId, digest);
    if (graph === null) throw new RepositoryMergeCommitNotFoundError(digest);
    cache.set(digest, graph);
    return graph;
  };
  const [source, target] = await Promise.all([load(input.sourceDigest), load(input.targetDigest)]);

  const collectAncestors = async (
    start: VerifiedTransitionCommitGraph
  ): Promise<Map<string, CommitDistance>> => {
    const distances = new Map<string, CommitDistance>();
    const queue: CommitDistance[] = [{ graph: start, distance: 0 }];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]!;
      const digest = describeCommitV2(current.graph.commit).digest;
      const previous = distances.get(digest);
      if (previous !== undefined && previous.distance <= current.distance) continue;
      distances.set(digest, current);
      for (const parent of current.graph.commit.parents) {
        queue.push({ graph: await load(parent.digest), distance: current.distance + 1 });
      }
    }
    return distances;
  };

  const [sourceAncestors, targetAncestors] = await Promise.all([
    collectAncestors(source),
    collectAncestors(target),
  ]);
  const candidates = [...sourceAncestors.entries()]
    .filter(([digest]) => targetAncestors.has(digest))
    .map(([digest, sourceDistance]) => ({
      digest,
      graph: sourceDistance.graph,
      sourceDistance: sourceDistance.distance,
      targetDistance: targetAncestors.get(digest)!.distance,
    }))
    .sort(
      (left, right) =>
        left.sourceDistance + left.targetDistance - (right.sourceDistance + right.targetDistance) ||
        Math.max(left.sourceDistance, left.targetDistance) -
          Math.max(right.sourceDistance, right.targetDistance) ||
        left.digest.localeCompare(right.digest)
    );
  const mergeBase = candidates[0]?.graph ?? null;
  const mergeBaseState =
    mergeBase?.state ?? createRepositorySemanticState({ trees: [], relations: [] });
  const prepared = prepareMerge(
    decodeRepositorySemanticState(mergeBaseState),
    decodeRepositorySemanticState(source.state),
    decodeRepositorySemanticState(target.state)
  );
  return { source, target, mergeBaseState, prepared };
}

export interface PrepareRepositoryYOpsMergeInput {
  db: AnyDB;
  projectId: string;
  sourceDigest: string;
  targetDigest: string;
}

/** Recompute the merge plan only from verified CommitV2 graphs. */
export async function prepareRepositoryYOpsMerge(
  input: PrepareRepositoryYOpsMergeInput
): Promise<MergeResult> {
  const context = await loadRepositoryMergeContext(input);
  return context.prepared;
}

export interface CommitRepositoryYOpsMergeInput extends PrepareRepositoryYOpsMergeInput {
  refName: string;
  decisions: MergeDecision;
  actor: ActorRef;
  message: string;
}

export interface CommitRepositoryYOpsMergeResult {
  commit: CommitV2;
  commitDigest: string;
  recordedAt: string;
  content: SemanticContent;
  mergeSummary: MergeSummaryData;
  transition: TransitionViewV1;
}

/** Commit a deterministic two-parent merge through the complete Transition graph. */
export async function commitRepositoryYOpsMerge(
  input: CommitRepositoryYOpsMergeInput
): Promise<CommitRepositoryYOpsMergeResult> {
  const head = await getTransitionRefHead(input.db, {
    projectId: input.projectId,
    refName: input.refName,
  });
  if (head.format !== 'transition_v2' || head.head !== input.targetDigest) {
    throw new TransitionHeadConflictError(input.targetDigest, head.head);
  }
  const context = await loadRepositoryMergeContext(input);
  if (
    describeTransitionObject(head.state).digest !==
    describeTransitionObject(context.target.state).digest
  ) {
    throw new TransitionHeadConflictError(input.targetDigest, head.head);
  }
  const merged = createSemanticMergeEffect({
    target: context.target.state,
    mergeBase: context.mergeBaseState,
    source: context.source.state,
    decisions: input.decisions,
    expectedTarget: context.target.commit.result,
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

  const recordedAt = new Date().toISOString() as CanonicalTimestamp;
  const replay = buildReplayVerificationStatement({
    effect: merged.effect,
    actor: MERGE_REPLAY_ACTOR,
    predicate: {
      outcome: 'verified',
      result: merged.effect.result,
      tool: MERGE_REPLAY_TOOL,
      run: {
        id: `repository:${input.projectId}:ref:${input.refName}:target:${input.targetDigest}:source:${input.sourceDigest}:merge-replay`,
        recordedAt,
      },
      environment: UNSPECIFIED_ENVIRONMENT,
    },
  });
  const observations: StatementObservation[] = [
    { statement: replay, issuerContext: { actor: MERGE_REPLAY_ACTOR } },
  ];
  const authority: RepositoryDecisionAuthority = {
    async resolve() {
      return {
        actorContext: { actor: input.actor },
        observationScope: {
          completeness: 'complete',
          sources: ['server:repository-semantic-merge'],
        },
        policy: REPOSITORY_MERGE_POLICY.policy,
        policyResource: REPOSITORY_MERGE_POLICY.resource,
        statements: observations,
      };
    },
  };
  const issued = await authorizeDecisionForRepository({
    projectId: input.projectId,
    refName: input.refName,
    proposal: compiled.proposal,
    effect: merged.effect,
    outcome: 'accepted',
    rationale: { mode: 'unspecified' },
    decidedAt: recordedAt,
    authority,
  });
  if (!issued.ok || issued.authorization === null) {
    throw new RepositoryStateDecisionDeniedError(issued.ok ? [] : issued.failures);
  }

  await recordRepositoryDecisionAuthorization(input.db, issued.authorization);
  const objects: ProtocolObject[] = [
    context.target.state,
    context.source.state,
    context.mergeBaseState,
    merged.result,
    context.target.commit,
    context.source.commit,
    ...issued.authorization.objects,
  ];
  const commit = await createCommitV2({
    parents: [describeCommitV2(context.target.commit), describeCommitV2(context.source.commit)],
    decision: issued.decision,
    resolver: new InMemoryTransitionObjectResolver(objects),
  });
  const created = await createTransitionCommit(input.db, {
    projectId: input.projectId,
    refName: input.refName,
    expectedHead: input.targetDigest,
    commit,
    objects,
  });
  const transition = await getTransitionViewForCommit(input.db, {
    projectId: input.projectId,
    refName: input.refName,
    commitId: created.digest,
  });
  if (transition === null) throw new TypeError('Committed merge Transition could not be resolved');

  const keptFromSource = new Set(input.decisions.keepFromSource).size;
  const keptFromTarget = new Set(input.decisions.keepFromTarget).size;
  return {
    commit,
    commitDigest: created.digest,
    recordedAt,
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
    transition,
  };
}
