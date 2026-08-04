import {
  authorizeDecisionForRepository,
  type CommitV2,
  createCommitV2,
  describeCommitV2,
  describeTransitionObject,
  InMemoryTransitionObjectResolver,
  type PolicyFailure,
  type RepositoryDecisionAuthority,
  type RequestedDecisionOutcome,
} from '@t3x-dev/core';
import {
  type AnyDB,
  createTransitionCommit,
  DecisionNotAuthorizedError,
  digestTransitionRequestCanonicalJson,
  findTransitionCommandReceipt,
  findWorkspaceDraft,
  getRepositoryDecisionAudit,
  getTransitionCommit,
  getTransitionPolicyBinding,
  getTransitionRefHead,
  getTransitionViewForCommit,
  recordRepositoryDecision,
  recordRepositoryDecisionAuthorization,
  recordTransitionCommandReceipt,
  resolveTransitionProposalGraph,
  TransitionCommandConflictError,
  TransitionHeadConflictError,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import {
  canonicalizeProtocolValue,
  type DecisionStatement,
  type ProtocolObject,
  type ProtocolValue,
  type StringClaim,
} from '@t3x-dev/transition';
import { inspectTransition, type TransitionControlPlaneView } from './index';

type ActorRef = { kind: 'human' | 'agent' | 'service'; id: string };
type CanonicalTimestamp = Parameters<typeof authorizeDecisionForRepository>[0]['decidedAt'];
type TxRunner = { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T> };

const REPOSITORY_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['repository:transition-statement-memberships'],
});

export interface TransitionReviewPrecondition {
  workspaceRevision: number;
  refName: string;
  refHead: string | null;
  effectDigest: string;
  proposalDigest: string;
  statementDigests: string[];
  policyDigest: string;
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

function commandDigest(value: ProtocolValue): string {
  return digestTransitionRequestCanonicalJson(canonicalizeProtocolValue(value));
}

function normalizedPrecondition(precondition: TransitionReviewPrecondition): ProtocolValue {
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

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const orderedLeft = [...left].sort(comparePortable);
  const orderedRight = [...right].sort(comparePortable);
  return orderedLeft.every((value, index) => value === orderedRight[index]);
}

async function resolveReviewFacts(db: AnyDB, projectId: string, transitionId: string) {
  const graph = await resolveTransitionProposalGraph(db, projectId, transitionId);
  const [workspace, head, policyBinding] = await Promise.all([
    findWorkspaceDraft(db, projectId, graph.membership.workspaceId),
    getTransitionRefHead(db, {
      projectId,
      refName: graph.membership.refName,
    }),
    getTransitionPolicyBinding(db, projectId, graph.membership.refName),
  ]);
  if (workspace === null || policyBinding === null) throw new TransitionReviewStaleError();
  return { graph, workspace, head, policyBinding };
}

function assertReviewPrecondition(
  input: TransitionReviewPrecondition,
  facts: Awaited<ReturnType<typeof resolveReviewFacts>>
): void {
  const statementDigests = facts.graph.observations.map(
    (observation) => observation.membership.statementDigest
  );
  if (
    input.workspaceRevision !== facts.workspace.revision ||
    input.workspaceRevision !== facts.graph.membership.workspaceRevision ||
    input.refName !== facts.graph.membership.refName ||
    input.refHead !== facts.graph.membership.refHead ||
    input.refHead !== facts.head.head ||
    input.effectDigest !== facts.graph.membership.effectDigest ||
    input.proposalDigest !== facts.graph.membership.proposalDigest ||
    input.policyDigest !== facts.policyBinding.resource.digest ||
    !sameStringSet(input.statementDigests, statementDigests)
  ) {
    throw new TransitionReviewStaleError();
  }
}

function decisionRationale(input: {
  outcome: RequestedDecisionOutcome;
  actor: ActorRef;
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

function assertDecisionMembership(
  decision: DecisionStatement,
  graph: Awaited<ReturnType<typeof resolveTransitionProposalGraph>>
): void {
  if (!sameDescriptor(decision.subjects[0]!, describeTransitionObject(graph.proposal))) {
    throw new TransitionDecisionMembershipError(
      'Stored Decision does not bind this Transition Proposal membership'
    );
  }
}

async function resolveDecisionRetry(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  actor: ActorRef;
  requestId: string;
  requestDigest: string;
}): Promise<DecideTransitionResult | null> {
  const receipt = await findTransitionCommandReceipt(input.db, input);
  if (receipt === null) return null;
  if (
    receipt.action !== 'decide' ||
    receipt.resultKind !== 'decision' ||
    receipt.requestDigest !== input.requestDigest
  ) {
    throw new TransitionCommandConflictError(input.requestId);
  }
  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  const audit = await getRepositoryDecisionAudit(input.db, {
    projectId: input.projectId,
    refName: graph.membership.refName,
    decisionDigest: receipt.resultDigest,
  });
  if (audit === null) {
    throw new TransitionDecisionMembershipError('Decision receipt has no verified audit record');
  }
  assertDecisionMembership(audit.decision, graph);
  return {
    view: await inspectTransition({
      db: input.db,
      projectId: input.projectId,
      transitionId: input.transitionId,
      actor: input.actor,
      decision: audit.decision,
    }),
    decision: audit.decision,
    decisionDigest: receipt.resultDigest,
    reused: true,
  };
}

export interface DecideTransitionResult {
  view: TransitionControlPlaneView;
  decision: DecisionStatement;
  decisionDigest: string;
  reused: boolean;
}

export async function decideTransition(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  actor: ActorRef;
  requestId: string;
  outcome: RequestedDecisionOutcome;
  rationale?: string;
  precondition: TransitionReviewPrecondition;
}): Promise<DecideTransitionResult> {
  if (input.outcome === 'overridden' && input.actor.kind !== 'human') {
    throw new TransitionAutomatedOverrideDeniedError();
  }
  const normalized: ProtocolValue = {
    operation: 'decide',
    outcome: input.outcome,
    ...(input.rationale === undefined ? {} : { rationale: input.rationale.trim() }),
    precondition: normalizedPrecondition(input.precondition),
  };
  const requestDigest = commandDigest(normalized);
  const prior = await resolveDecisionRetry({ ...input, requestDigest });
  if (prior !== null) return prior;

  const facts = await resolveReviewFacts(input.db, input.projectId, input.transitionId);
  assertReviewPrecondition(input.precondition, facts);
  const authority: RepositoryDecisionAuthority = {
    async resolve() {
      return {
        actorContext: { actor: input.actor },
        observationScope: REPOSITORY_SCOPE,
        policy: facts.policyBinding.policy,
        policyResource: facts.policyBinding.resource,
        statements: facts.graph.observations.map((observation) => ({
          statement: observation.statement,
          issuerContext: observation.issuerContext,
        })),
      };
    },
  };
  const issued = await authorizeDecisionForRepository({
    projectId: input.projectId,
    refName: facts.graph.membership.refName,
    proposal: facts.graph.proposal,
    effect: facts.graph.effect,
    outcome: input.outcome,
    rationale: decisionRationale(input),
    decidedAt: new Date().toISOString() as CanonicalTimestamp,
    authority,
  });
  if (!issued.ok) throw new TransitionDecisionDeniedError(issued.failures);

  const decisionDigest = describeTransitionObject(issued.decision).digest;
  try {
    await (input.db as unknown as TxRunner).transaction(async (rawTx) => {
      const tx = rawTx as AnyDB;
      if (issued.authorization === null) {
        await recordRepositoryDecision(tx, issued.record);
      } else {
        await recordRepositoryDecisionAuthorization(tx, issued.authorization);
      }
      await recordTransitionCommandReceipt(tx, {
        transitionId: input.transitionId,
        projectId: input.projectId,
        action: 'decide',
        actor: input.actor,
        requestId: input.requestId,
        requestDigest,
        resultKind: 'decision',
        resultDigest: decisionDigest,
      });
    });
  } catch (error) {
    if (error instanceof TransitionCommandConflictError) {
      const winner = await resolveDecisionRetry({ ...input, requestDigest });
      if (winner !== null) return winner;
    }
    throw error;
  }

  return {
    view: await inspectTransition({
      db: input.db,
      projectId: input.projectId,
      transitionId: input.transitionId,
      actor: input.actor,
      decision: issued.decision,
    }),
    decision: issued.decision,
    decisionDigest,
    reused: false,
  };
}

async function resolveCommitRetry(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  actor: ActorRef;
  requestId: string;
  requestDigest: string;
  decisionDigest: string;
}): Promise<CommitTransitionResult | null> {
  const receipt = await findTransitionCommandReceipt(input.db, input);
  if (receipt === null) return null;
  if (
    receipt.action !== 'commit' ||
    receipt.resultKind !== 'commit' ||
    receipt.requestDigest !== input.requestDigest
  ) {
    throw new TransitionCommandConflictError(input.requestId);
  }
  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  const stored = await getTransitionCommit(input.db, input.projectId, receipt.resultDigest);
  if (stored === null || stored.commit.decision.digest !== input.decisionDigest) {
    throw new TransitionDecisionMembershipError('Commit receipt has no matching CommitV2');
  }
  const view = await getTransitionViewForCommit(input.db, {
    projectId: input.projectId,
    refName: graph.membership.refName,
    commitId: receipt.resultDigest,
  });
  if (view === null) {
    throw new TransitionDecisionMembershipError('Commit receipt cannot be projected');
  }
  return {
    view,
    commit: stored.commit,
    commitDigest: receipt.resultDigest,
    reused: true,
  };
}

export interface CommitTransitionResult {
  view: Awaited<ReturnType<typeof getTransitionViewForCommit>> extends infer T
    ? Exclude<T, null>
    : never;
  commit: CommitV2;
  commitDigest: string;
  reused: boolean;
  workspace?: Record<string, unknown>;
}

export async function commitTransition(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  actor: ActorRef;
  requestId: string;
  decisionDigest: string;
  expectedHead: string | null;
}): Promise<CommitTransitionResult> {
  const requestDigest = commandDigest({
    operation: 'commit',
    decision_digest: input.decisionDigest,
    expected_head: input.expectedHead,
  });
  const prior = await resolveCommitRetry({ ...input, requestDigest });
  if (prior !== null) return prior;

  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  if (input.expectedHead !== graph.membership.refHead) {
    throw new TransitionHeadConflictError(graph.membership.refHead, input.expectedHead);
  }
  const [audit, head, workspace] = await Promise.all([
    getRepositoryDecisionAudit(input.db, {
      projectId: input.projectId,
      refName: graph.membership.refName,
      decisionDigest: input.decisionDigest,
    }),
    getTransitionRefHead(input.db, {
      projectId: input.projectId,
      refName: graph.membership.refName,
    }),
    findWorkspaceDraft(input.db, input.projectId, graph.membership.workspaceId),
  ]);
  if (audit === null) {
    throw new TransitionDecisionMembershipError('Decision is not in this repository audit ledger');
  }
  assertDecisionMembership(audit.decision, graph);
  if (audit.outcome === 'rejected') {
    throw new DecisionNotAuthorizedError(input.decisionDigest);
  }
  if (head.head !== input.expectedHead) {
    throw new TransitionHeadConflictError(input.expectedHead, head.head);
  }
  if (workspace === null || workspace.revision !== graph.membership.workspaceRevision) {
    throw new TransitionReviewStaleError();
  }
  const parentObjects = head.format === 'transition_v2' ? [head.commit] : [];
  const parents = head.format === 'transition_v2' ? [describeCommitV2(head.commit)] : [];
  const objects: ProtocolObject[] = [
    graph.base,
    graph.result,
    graph.effect,
    graph.proposal,
    ...graph.observations.map((observation) => observation.statement),
    audit.decision,
    ...parentObjects,
  ];
  const commit = await createCommitV2({
    parents,
    decision: audit.decision,
    resolver: new InMemoryTransitionObjectResolver(objects),
  });
  const commitDigest = describeCommitV2(commit).digest;
  const committedAt = new Date().toISOString();

  let committedWorkspace: Record<string, unknown> | undefined;
  try {
    await (input.db as unknown as TxRunner).transaction(async (rawTx) => {
      const tx = rawTx as AnyDB;
      await createTransitionCommit(tx, {
        projectId: input.projectId,
        refName: graph.membership.refName,
        expectedHead: input.expectedHead,
        commit,
        objects,
      });
      const currentWorkspace = await findWorkspaceDraft(
        tx,
        input.projectId,
        graph.membership.workspaceId
      );
      if (
        currentWorkspace === null ||
        currentWorkspace.revision !== graph.membership.workspaceRevision
      ) {
        throw new TransitionReviewStaleError();
      }
      const nextWorkspace = {
        ...(currentWorkspace.workspace_state ?? {}),
        id: graph.membership.workspaceId,
        projectId: input.projectId,
        lastCommitHash: commitDigest,
        status: 'committed',
        updatedAt: committedAt,
      };
      const draft = await upsertWorkspaceDraft(
        tx,
        {
          project_id: input.projectId,
          workspace_id: graph.membership.workspaceId,
          title: currentWorkspace.title || graph.membership.workspaceId,
          parent_commit_hash: input.expectedHead,
          target_branch: graph.membership.refName,
          workspace_state: nextWorkspace,
        },
        currentWorkspace.revision
      );
      committedWorkspace = { ...(draft.workspace_state ?? {}), revision: draft.revision };
      await recordTransitionCommandReceipt(tx, {
        transitionId: input.transitionId,
        projectId: input.projectId,
        action: 'commit',
        actor: input.actor,
        requestId: input.requestId,
        requestDigest,
        resultKind: 'commit',
        resultDigest: commitDigest,
      });
    });
  } catch (error) {
    if (
      error instanceof TransitionCommandConflictError ||
      error instanceof TransitionHeadConflictError
    ) {
      const winner = await resolveCommitRetry({ ...input, requestDigest });
      if (winner !== null) return winner;
    }
    throw error;
  }

  const view = await getTransitionViewForCommit(input.db, {
    projectId: input.projectId,
    refName: graph.membership.refName,
    commitId: commitDigest,
  });
  if (view === null) throw new TransitionDecisionMembershipError('Committed view is unavailable');
  return {
    view,
    commit,
    commitDigest,
    reused: false,
    ...(committedWorkspace === undefined ? {} : { workspace: committedWorkspace }),
  };
}
