import {
  assertPreparedRepositoryTransitionAuthorityBundle,
  assertTransitionDecisionMembership,
  assertTransitionReviewPrecondition,
  buildTransitionCommitCommand,
  buildTransitionDecisionCommand,
  decisionRationale,
  digestTransitionReviewPrecondition as digestTransitionReviewPreconditionWith,
  isGeneratedProposalPreparation,
  type PreparedRepositoryTransitionTarget,
  type RepositoryWriterServerPolicyBindingExpectation,
  sameTransitionPolicyResource,
  TransitionAutomatedOverrideDeniedError,
  TransitionDecisionDeniedError,
  TransitionDecisionMembershipError,
  type TransitionReviewPrecondition,
  TransitionReviewStaleError,
} from '@t3x-dev/application';
import {
  authorizeDecisionForRepository,
  type CommitV2,
  createCommitV2,
  describeCommitV2,
  describeTransitionObject,
  InMemoryTransitionObjectResolver,
  type ProposalStatement,
  type RepositoryDecisionAuthority,
  type RequestedDecisionOutcome,
  type StatementObservation,
} from '@t3x-dev/core';
import {
  type AnyDB,
  acquireTransitionPolicyBindingLock,
  acquireTransitionReviewLock,
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
  type ResolvedTransitionProposalGraph,
  recordRepositoryDecision,
  recordRepositoryDecisionAuthorization,
  recordTransitionCommandReceipt,
  resolveTransitionProposalGraph,
  TransitionCommandConflictError,
  TransitionHeadConflictError,
  type TransitionPolicyBinding,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import {
  canonicalizeProtocolValue,
  type DecisionStatement,
  type ProtocolObject,
  type ProtocolValue,
  type StringClaim,
} from '@t3x-dev/transition';
import {
  assertGenerationDecisionActor,
  resolveApplicableTransitionPolicy,
} from './applicable-policy';
import { inspectTransition, type TransitionControlPlaneView } from './index';

type ActorRef = { kind: 'human' | 'agent' | 'service'; id: string };
type CanonicalTimestamp = Parameters<typeof authorizeDecisionForRepository>[0]['decidedAt'];
type TxRunner = { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T> };

const REPOSITORY_SCOPE = Object.freeze({
  completeness: 'complete' as const,
  sources: ['repository:transition-statement-memberships'],
});

export type { TransitionReviewPrecondition };

export interface TransitionDecisionAuthoritySelection {
  select(input: {
    graph: ResolvedTransitionProposalGraph;
    refPolicyBinding: TransitionPolicyBinding | null;
  }):
    | {
        policyDigest: string;
        authority: RepositoryDecisionAuthority;
      }
    | Promise<{
        policyDigest: string;
        authority: RepositoryDecisionAuthority;
      }>;
}

export interface TransitionWorkspaceCommitProjection {
  requestFacts: ProtocolValue;
  yopsLogIds?: readonly string[];
  apply(input: {
    workspace: Record<string, unknown>;
    commitDigest: string;
    committedAt: string;
  }): Record<string, unknown>;
}

export interface CommitPreparedRepositoryTransitionInput {
  db: AnyDB;
  preparedTarget: PreparedRepositoryTransitionTarget;
  projectId: string;
  refName: string;
  expectedHead: string | null;
  proposal: ProposalStatement;
  effect: Extract<ProtocolObject, { schema: 't3x/effect/v1' }>;
  rationale: StringClaim;
  decidedAt: CanonicalTimestamp;
  authority: RepositoryDecisionAuthority;
  parents: readonly CommitV2[];
  objects: readonly ProtocolObject[];
  yopsLogIds?: readonly string[];
  /**
   * Exact server binding observed by a compatibility adapter before
   * preparation. Presence is tri-state: omitting this field selects an
   * internal explicit policy; `expected: null` seals an observed absence.
   */
  serverPolicyBindingExpectation?: RepositoryWriterServerPolicyBindingExpectation;
}

export interface CommitPreparedRepositoryTransitionResult {
  commit: CommitV2;
  commitDigest: string;
  transition: Exclude<Awaited<ReturnType<typeof getTransitionViewForCommit>>, null>;
}

export {
  TransitionAutomatedOverrideDeniedError,
  TransitionDecisionDeniedError,
  TransitionDecisionMembershipError,
  TransitionReviewStaleError,
};

function commandDigest(value: ProtocolValue): string {
  return digestTransitionRequestCanonicalJson(canonicalizeProtocolValue(value));
}

export function digestTransitionReviewPrecondition(
  precondition: TransitionReviewPrecondition
): string {
  return digestTransitionReviewPreconditionWith(precondition, commandDigest);
}

async function resolveReviewFacts(
  db: AnyDB,
  projectId: string,
  transitionId: string,
  policyBindingFoundAtLock: boolean
) {
  const graph = await resolveTransitionProposalGraph(db, projectId, transitionId);
  const [workspace, head, refPolicyBinding] = await Promise.all([
    findWorkspaceDraft(db, projectId, graph.membership.workspaceId),
    getTransitionRefHead(db, {
      projectId,
      refName: graph.membership.refName,
    }),
    policyBindingFoundAtLock
      ? getTransitionPolicyBinding(db, projectId, graph.membership.refName)
      : Promise.resolve(null),
  ]);
  if (workspace === null) throw new TransitionReviewStaleError();
  return {
    graph,
    workspace,
    head,
    refPolicyBinding,
  };
}

async function resolveDecisionRetry(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  actor: ActorRef;
  requestId: string;
  requestDigest: string;
  precondition: TransitionReviewPrecondition;
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
  assertTransitionDecisionMembership({
    decision: audit.decision,
    proposalDescriptor: describeTransitionObject(graph.proposal),
  });
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
    reviewDigest: digestTransitionReviewPrecondition(input.precondition),
    reused: true,
  };
}

export interface DecideTransitionResult {
  view: TransitionControlPlaneView;
  decision: DecisionStatement;
  decisionDigest: string;
  reviewDigest: string;
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
  authoritySelection?: TransitionDecisionAuthoritySelection;
}): Promise<DecideTransitionResult> {
  if (input.outcome === 'overridden' && input.actor.kind !== 'human') {
    throw new TransitionAutomatedOverrideDeniedError();
  }
  if (input.actor.kind !== 'human') {
    const graph = await resolveTransitionProposalGraph(
      input.db,
      input.projectId,
      input.transitionId
    );
    assertGenerationDecisionActor({
      actor: input.actor,
      requestKind: graph.membership.requestKind,
      preparationFacts:
        graph.preparation === null
          ? null
          : (JSON.parse(graph.preparation.canonicalJson) as ProtocolValue),
    });
  }
  const { requestDigest, reviewDigest } = buildTransitionDecisionCommand({
    outcome: input.outcome,
    rationale: input.rationale,
    precondition: input.precondition,
    digestCanonicalRequest: commandDigest,
  });
  const prior = await resolveDecisionRetry({ ...input, requestDigest });
  if (prior !== null) return prior;

  let persisted:
    | {
        view: TransitionControlPlaneView;
        decision: DecisionStatement;
        decisionDigest: string;
      }
    | undefined;
  try {
    persisted = await (input.db as unknown as TxRunner).transaction(async (rawTx) => {
      const tx = rawTx as AnyDB;
      const locked = await acquireTransitionReviewLock(tx, input.projectId, input.transitionId);
      if (
        locked.membershipFound &&
        input.authoritySelection === undefined &&
        !locked.policyBindingFound
      ) {
        // Default repository authority requires an explicit binding. The
        // project-parent lock keeps this observed absence sealed until the
        // transaction finishes.
        throw new TransitionReviewStaleError();
      }
      const facts = await resolveReviewFacts(
        tx,
        input.projectId,
        input.transitionId,
        locked.policyBindingFound
      );
      const selected =
        input.authoritySelection === undefined
          ? (() => {
              if (facts.refPolicyBinding === null) throw new TransitionReviewStaleError();
              const applicablePolicy = resolveApplicableTransitionPolicy({
                refPolicyBinding: facts.refPolicyBinding,
                requestKind: facts.graph.membership.requestKind,
                preparationFacts:
                  facts.graph.preparation === null
                    ? null
                    : (JSON.parse(facts.graph.preparation.canonicalJson) as ProtocolValue),
              });
              return {
                policyDigest: applicablePolicy.resource.digest,
                authority: {
                  async resolve() {
                    return {
                      actorContext: { actor: input.actor },
                      observationScope: REPOSITORY_SCOPE,
                      policy: applicablePolicy.policy,
                      policyResource: applicablePolicy.resource,
                      statements: facts.graph.observations.map((observation) => ({
                        statement: observation.statement as StatementObservation['statement'],
                        issuerContext: observation.issuerContext,
                      })),
                    };
                  },
                } satisfies RepositoryDecisionAuthority,
              };
            })()
          : await input.authoritySelection.select({
              graph: facts.graph,
              refPolicyBinding: facts.refPolicyBinding,
            });
      assertTransitionReviewPrecondition({
        precondition: input.precondition,
        facts: {
          graph: facts.graph,
          workspaceRevision: facts.workspace.revision,
          refHead: facts.head.head,
          policyDigest: selected.policyDigest,
        },
      });
      const issued = await authorizeDecisionForRepository({
        projectId: input.projectId,
        refName: facts.graph.membership.refName,
        proposal: facts.graph.proposal,
        effect: facts.graph.effect,
        outcome: input.outcome,
        rationale: decisionRationale(input),
        decidedAt: new Date().toISOString() as CanonicalTimestamp,
        authority: selected.authority,
      });
      if (!issued.ok) throw new TransitionDecisionDeniedError(issued.failures);
      if (
        issued.decision.predicate.policy.mode !== 'evaluated' ||
        issued.decision.predicate.policy.resource.digest !== selected.policyDigest
      ) {
        throw new TransitionReviewStaleError();
      }

      const decisionDigest = describeTransitionObject(issued.decision).digest;
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
      return {
        view: await inspectTransition({
          db: tx,
          projectId: input.projectId,
          transitionId: input.transitionId,
          actor: input.actor,
          decision: issued.decision,
        }),
        decision: issued.decision,
        decisionDigest,
      };
    });
  } catch (error) {
    if (error instanceof TransitionCommandConflictError) {
      const winner = await resolveDecisionRetry({ ...input, requestDigest });
      if (winner !== null) return winner;
    }
    throw error;
  }
  if (persisted === undefined) throw new TransitionReviewStaleError();

  return {
    view: persisted.view,
    decision: persisted.decision,
    decisionDigest: persisted.decisionDigest,
    reviewDigest,
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
  const [stored, workspace] = await Promise.all([
    getTransitionCommit(input.db, input.projectId, receipt.resultDigest),
    findWorkspaceDraft(input.db, input.projectId, graph.membership.workspaceId),
  ]);
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
    ...(workspace?.workspace_state?.lastCommitHash === receipt.resultDigest
      ? { workspace: { ...workspace.workspace_state, revision: workspace.revision } }
      : {}),
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

async function persistTransitionCommitGraph(
  db: AnyDB,
  input: {
    projectId: string;
    refName: string;
    expectedHead: string | null;
    commit: CommitV2;
    objects: readonly ProtocolObject[];
    yopsLogIds?: readonly string[];
  }
) {
  return createTransitionCommit(db, {
    projectId: input.projectId,
    refName: input.refName,
    expectedHead: input.expectedHead,
    commit: input.commit,
    objects: [...input.objects],
    ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: input.yopsLogIds }),
  });
}

async function resolvePreparedServerPolicyBinding(input: {
  tx: AnyDB;
  projectId: string;
  refName: string;
  expectation: NonNullable<
    CommitPreparedRepositoryTransitionInput['serverPolicyBindingExpectation']
  >;
}): Promise<TransitionPolicyBinding | null> {
  const locked = await acquireTransitionPolicyBindingLock(input.tx, input.projectId, input.refName);
  const live = locked.policyBindingFound
    ? await getTransitionPolicyBinding(input.tx, input.projectId, input.refName)
    : null;
  if (
    (input.expectation.required && live === null) ||
    (input.expectation.expected === null) !== (live === null) ||
    (input.expectation.expected !== null &&
      live !== null &&
      !sameTransitionPolicyResource(input.expectation.expected.resource, live.resource))
  ) {
    throw new TransitionReviewStaleError();
  }
  return live;
}

/**
 * Execute the shared Decision -> Commit portion for a task adapter that has
 * already prepared and verified an immutable Proposal graph.
 *
 * Unlike the review-oriented canonical API, this compatibility boundary does
 * not invent Workspace membership or command receipts. It does centralize the
 * authorization, CommitV2 construction, atomic audit persistence, and ref CAS.
 */
export async function commitPreparedRepositoryTransition(
  input: CommitPreparedRepositoryTransitionInput
): Promise<CommitPreparedRepositoryTransitionResult> {
  assertPreparedRepositoryTransitionAuthorityBundle({
    authority: input.authority,
    target: input.preparedTarget,
    proposal: input.proposal,
    effect: input.effect,
    rationale: input.rationale,
    decidedAt: input.decidedAt,
    parents: input.parents,
    objects: input.objects,
    ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: input.yopsLogIds }),
    ...(input.serverPolicyBindingExpectation === undefined
      ? {}
      : { serverPolicyBindingExpectation: input.serverPolicyBindingExpectation }),
  });
  const { projectId, refName, expectedHead } = input.preparedTarget;
  if (input.projectId !== projectId) {
    throw new TransitionDecisionMembershipError(
      'Prepared repository target project does not match the commit project'
    );
  }
  if (input.refName !== refName) {
    throw new TransitionDecisionMembershipError(
      'Prepared repository target ref does not match the commit ref'
    );
  }
  if (input.expectedHead !== expectedHead) {
    throw new TransitionDecisionMembershipError(
      'Prepared repository target expected head does not match the commit expected head'
    );
  }
  const persisted = await (input.db as unknown as TxRunner).transaction(async (rawTx) => {
    const tx = rawTx as AnyDB;
    const liveServerPolicyBinding =
      input.serverPolicyBindingExpectation === undefined
        ? null
        : await resolvePreparedServerPolicyBinding({
            tx,
            projectId,
            refName,
            expectation: input.serverPolicyBindingExpectation,
          });
    const issued = await authorizeDecisionForRepository({
      projectId,
      refName,
      proposal: input.proposal,
      effect: input.effect,
      outcome: 'accepted',
      rationale: input.rationale,
      decidedAt: input.decidedAt,
      authority: input.authority,
    });
    if (!issued.ok || issued.authorization === null) {
      throw new TransitionDecisionDeniedError(issued.ok ? [] : issued.failures);
    }
    if (
      liveServerPolicyBinding !== null &&
      (issued.decision.predicate.policy.mode !== 'evaluated' ||
        !sameTransitionPolicyResource(
          issued.decision.predicate.policy.resource,
          liveServerPolicyBinding.resource
        ))
    ) {
      throw new TransitionReviewStaleError();
    }
    const authorization = issued.authorization;
    const objects: ProtocolObject[] = [...input.objects, ...authorization.objects];
    const commit = await createCommitV2({
      parents: input.parents.map(describeCommitV2),
      decision: issued.decision,
      resolver: new InMemoryTransitionObjectResolver(objects),
    });
    await recordRepositoryDecisionAuthorization(tx, authorization);
    const created = await persistTransitionCommitGraph(tx, {
      projectId,
      refName,
      expectedHead,
      commit,
      objects,
      ...(input.yopsLogIds === undefined ? {} : { yopsLogIds: input.yopsLogIds }),
    });
    return { commit, created };
  });
  const transition = await getTransitionViewForCommit(input.db, {
    projectId,
    refName,
    commitId: persisted.created.digest,
  });
  if (transition === null) {
    throw new TransitionDecisionMembershipError('Committed repository Transition is unavailable');
  }
  return {
    commit: persisted.commit,
    commitDigest: persisted.created.digest,
    transition,
  };
}

export async function commitTransition(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  actor: ActorRef;
  requestId: string;
  decisionDigest: string;
  expectedHead: string | null;
  workspaceProjection?: TransitionWorkspaceCommitProjection;
}): Promise<CommitTransitionResult> {
  const { requestDigest } = buildTransitionCommitCommand({
    decisionDigest: input.decisionDigest,
    expectedHead: input.expectedHead,
    workspaceProjectionFacts: input.workspaceProjection?.requestFacts,
    digestCanonicalRequest: commandDigest,
  });
  const prior = await resolveCommitRetry({ ...input, requestDigest });
  if (prior !== null) return prior;

  const graph = await resolveTransitionProposalGraph(input.db, input.projectId, input.transitionId);
  if (input.expectedHead !== graph.membership.refHead) {
    throw new TransitionHeadConflictError(input.expectedHead, graph.membership.refHead);
  }
  const [audit, head, workspace, refPolicyBinding] = await Promise.all([
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
    getTransitionPolicyBinding(input.db, input.projectId, graph.membership.refName),
  ]);
  if (audit === null) {
    throw new TransitionDecisionMembershipError('Decision is not in this repository audit ledger');
  }
  assertTransitionDecisionMembership({
    decision: audit.decision,
    proposalDescriptor: describeTransitionObject(graph.proposal),
  });
  if (audit.outcome === 'rejected') {
    throw new DecisionNotAuthorizedError(input.decisionDigest);
  }
  const preparationFacts =
    graph.preparation === null
      ? null
      : (JSON.parse(graph.preparation.canonicalJson) as ProtocolValue);
  const isGeneratedProposal = isGeneratedProposalPreparation(preparationFacts);
  if (refPolicyBinding === null && isGeneratedProposal) throw new TransitionReviewStaleError();
  const applicablePolicy =
    refPolicyBinding === null
      ? null
      : resolveApplicableTransitionPolicy({
          refPolicyBinding,
          requestKind: graph.membership.requestKind,
          preparationFacts,
        });
  // Generated Proposals are always decided against the server-derived overlay.
  // Other adapters may deliberately select a narrower authority policy whose
  // resource is not the ref binding, so preserve their existing commit path.
  if (
    applicablePolicy?.mode === 'generation_overlay' &&
    (audit.decision.predicate.policy.mode !== 'evaluated' ||
      !sameTransitionPolicyResource(
        audit.decision.predicate.policy.resource,
        applicablePolicy.resource
      ))
  ) {
    throw new TransitionReviewStaleError();
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
      await persistTransitionCommitGraph(tx, {
        projectId: input.projectId,
        refName: graph.membership.refName,
        expectedHead: input.expectedHead,
        commit,
        objects,
        ...(input.workspaceProjection?.yopsLogIds === undefined
          ? {}
          : { yopsLogIds: input.workspaceProjection.yopsLogIds }),
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
      const baseWorkspace = {
        ...(currentWorkspace.workspace_state ?? {}),
        id: graph.membership.workspaceId,
        projectId: input.projectId,
        lastCommitHash: commitDigest,
        status: 'committed',
        updatedAt: committedAt,
      };
      const nextWorkspace =
        input.workspaceProjection === undefined
          ? baseWorkspace
          : input.workspaceProjection.apply({
              workspace: baseWorkspace,
              commitDigest,
              committedAt,
            });
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
