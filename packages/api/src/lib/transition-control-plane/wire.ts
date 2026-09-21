import type { inspectTransition } from './index';
import { digestTransitionReviewPrecondition } from './lifecycle';

type TransitionPreconditionView = Awaited<ReturnType<typeof inspectTransition>>['precondition'];

function wireViewPrecondition(precondition: TransitionPreconditionView) {
  const policyDigest = precondition.policyDigest;
  const wired = {
    workspace_revision: precondition.workspaceRevision,
    ref_name: precondition.refName,
    ref_head: precondition.refHead,
    effect_digest: precondition.effectDigest,
    proposal_digest: precondition.proposalDigest,
    statement_digests: precondition.statementDigests,
    policy_digest: policyDigest,
  };

  if (policyDigest === null) return wired;

  return {
    ...wired,
    review_digest: digestTransitionReviewPrecondition({
      ...precondition,
      policyDigest,
    }),
  };
}

export function wireTransitionView(view: Awaited<ReturnType<typeof inspectTransition>>) {
  return {
    transition_id: view.transitionId,
    project_id: view.projectId,
    workspace_id: view.workspaceId,
    request_kind: view.requestKind,
    request_id: view.requestId,
    created_at: view.createdAt,
    precondition: wireViewPrecondition(view.precondition),
    transition: view.transition,
    statements: view.statements.map((statement) => ({
      digest: statement.digest,
      source: statement.source,
      issuer: statement.issuer,
      request_id: statement.requestId,
      created_at: statement.createdAt,
    })),
    ...(view.generation === undefined ? {} : { generation: view.generation }),
  };
}
