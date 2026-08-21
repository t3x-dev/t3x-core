import { type AnyDB, resolveTransitionProposalGraph } from '@t3x-dev/storage';
import { decideWorkspaceSourceReviewFromChanges } from './workspace-source-transition';
import {
  type DecideWorkspaceTransitionInput,
  type DecideWorkspaceTransitionResult,
  decideWorkspaceTransition,
  WorkspaceTransitionReviewStaleError,
} from './workspace-transition';

export async function decideWorkspaceChange(
  db: AnyDB,
  input: DecideWorkspaceTransitionInput
): Promise<DecideWorkspaceTransitionResult> {
  if (input.transitionId === undefined) {
    return decideWorkspaceTransition(db, input);
  }

  try {
    return await decideWorkspaceTransition(db, input);
  } catch (error) {
    if (!isReviewStale(error)) {
      throw error;
    }
  }

  const graph = await resolveTransitionProposalGraph(db, input.projectId, input.transitionId);
  if (
    graph.membership.requestKind !== 'exact_source_import' &&
    graph.membership.requestKind !== 'exact_source_edit' &&
    graph.membership.requestKind !== 'exact_source_revert'
  ) {
    throw new WorkspaceTransitionReviewStaleError();
  }

  const decided = await decideWorkspaceSourceReviewFromChanges(db, {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    transitionId: input.transitionId,
    outcome: input.outcome,
    ...(input.decisionReason === undefined ? {} : { decisionReason: input.decisionReason }),
    precondition: input.precondition,
    actor: input.actor,
    ...(input.policyBinding === undefined ? {} : { policyBinding: input.policyBinding }),
  });
  return {
    transitionId: decided.transitionId,
    transition: decided.transition,
    precondition: input.precondition,
    decisionDigest: decided.decisionDigest,
    ...(decided.commit === undefined ? {} : { commit: decided.commit }),
    ...(decided.workspace === undefined ? {} : { workspace: decided.workspace }),
    reviewSnapshot: decided.reviewSnapshot,
    changeProjection: decided.changeProjection,
  };
}

function isReviewStale(error: unknown): boolean {
  return (
    error instanceof WorkspaceTransitionReviewStaleError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'STALE_REVIEW')
  );
}
