import {
  prepareRepositoryYOpsMergeWrite,
  prepareRepositoryYOpsStateWrite,
  RepositoryStateDecisionDeniedError,
  RepositoryStateProposalError,
} from '@t3x-dev/application';
import {
  type CommitV2,
  createRepositorySemanticState,
  createYOpsState,
  decodeRepositorySemanticState,
  describeCommitV2,
  describeTransitionObject,
  type MergeDecision,
  type MergeResult,
  type MergeSummaryData,
  type ProposalStatement,
  prepareMerge,
  type SemanticContent,
  type State,
  sha256,
  type TransitionViewV1,
} from '@t3x-dev/core';
import {
  type AnyDB,
  findConversationById,
  findTurnsByConversation,
  getTransitionRefHead,
  getVerifiedTransitionCommitGraph,
  listTransitionCommitProjectIds,
  TransitionHeadConflictError,
  type VerifiedTransitionCommitGraph,
} from '@t3x-dev/storage';
import type { CanonicalTimestamp, EvidenceRef } from '@t3x-dev/transition';
import {
  commitPreparedRepositoryTransition,
  TransitionDecisionDeniedError,
} from './transition-control-plane/lifecycle';

type ActorRef = ProposalStatement['actor'];

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

export { RepositoryStateDecisionDeniedError, RepositoryStateProposalError };

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
  const recordedAt = new Date().toISOString() as CanonicalTimestamp;
  const prepared = prepareRepositoryYOpsStateWrite({
    projectId: input.projectId,
    refName: input.refName,
    expectedHead: input.expectedHead,
    base,
    target: input.target,
    ...(head.format === 'transition_v2' ? { parentCommit: head.commit } : {}),
    actor: input.actor,
    ...(input.intent === undefined ? {} : { intent: input.intent }),
    ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: input.yopsLogIds }),
    recordedAt,
  });
  try {
    const created = await commitPreparedRepositoryTransition({
      db: input.db,
      projectId: input.projectId,
      refName: input.refName,
      expectedHead: input.expectedHead,
      proposal: prepared.proposal,
      effect: prepared.effect,
      rationale: prepared.rationale,
      decidedAt: prepared.decidedAt,
      authority: prepared.authority,
      parents: prepared.parents,
      objects: prepared.objects,
      ...(prepared.yopsLogIds === undefined ? {} : { yopsLogIds: prepared.yopsLogIds }),
    });
    return created;
  } catch (error) {
    if (error instanceof TransitionDecisionDeniedError) {
      throw new RepositoryStateDecisionDeniedError(error.failures);
    }
    throw error;
  }
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
  const source = await load(input.sourceDigest);
  const target = await load(input.targetDigest);

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

  const sourceAncestors = await collectAncestors(source);
  const targetAncestors = await collectAncestors(target);
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
  const recordedAt = new Date().toISOString() as CanonicalTimestamp;
  const prepared = prepareRepositoryYOpsMergeWrite({
    projectId: input.projectId,
    refName: input.refName,
    sourceDigest: input.sourceDigest,
    targetDigest: input.targetDigest,
    sourceState: context.source.state,
    targetState: context.target.state,
    mergeBaseState: context.mergeBaseState,
    sourceCommit: context.source.commit,
    targetCommit: context.target.commit,
    decisions: input.decisions,
    actor: input.actor,
    message: input.message,
    recordedAt,
  });
  let created: Awaited<ReturnType<typeof commitPreparedRepositoryTransition>>;
  try {
    created = await commitPreparedRepositoryTransition({
      db: input.db,
      projectId: input.projectId,
      refName: input.refName,
      expectedHead: input.targetDigest,
      proposal: prepared.proposal,
      effect: prepared.effect,
      rationale: prepared.rationale,
      decidedAt: prepared.decidedAt,
      authority: prepared.authority,
      parents: prepared.parents,
      objects: prepared.objects,
    });
  } catch (error) {
    if (error instanceof TransitionDecisionDeniedError) {
      throw new RepositoryStateDecisionDeniedError(error.failures);
    }
    throw error;
  }

  return {
    commit: created.commit,
    commitDigest: created.commitDigest,
    recordedAt,
    content: prepared.content,
    mergeSummary: prepared.mergeSummary,
    transition: created.transition,
  };
}
