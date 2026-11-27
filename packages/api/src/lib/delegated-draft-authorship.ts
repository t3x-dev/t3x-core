import { WorkspaceFullSchemaReviewSchema } from '@t3x-dev/api-client';
import { parseDraftActionLedger } from '@t3x-dev/application';

export class DelegatedDraftHumanDecisionRequired extends Error {
  readonly code = 'DELEGATED_DRAFT_HUMAN_DECISION_REQUIRED';
  constructor() {
    super(
      'A human must decide this fixed Review. It includes changes outside the Agent’s own verified content edits.'
    );
  }
}

/** The proposer of the fixed Review can differ from the authors of its constituent edits. */
export function enforceDelegatedDraftAuthorship(
  graph: {
    proposal: { actor: { kind: string; id: string } };
    preparation: { canonicalJson: string } | null;
  },
  actor: { kind: string; id: string }
) {
  if (
    graph.proposal.actor.kind !== actor.kind ||
    graph.proposal.actor.id !== actor.id ||
    !graph.preparation
  )
    throw new DelegatedDraftHumanDecisionRequired();
  const facts = JSON.parse(graph.preparation.canonicalJson);
  if (facts?.schema !== 't3x.application/workspace-authoring-preparation/v1')
    throw new DelegatedDraftHumanDecisionRequired();
  const review = WorkspaceFullSchemaReviewSchema.safeParse(facts.schemaReview);
  if (
    !review.success ||
    review.data.base.status !== 'bound' ||
    review.data.draft.status !== 'bound' ||
    review.data.base.schemaHash !== review.data.draft.schemaHash ||
    review.data.changes.length > 0
  )
    throw new DelegatedDraftHumanDecisionRequired();
  const { actions } = parseDraftActionLedger(facts.ledger);
  if (
    !actions.length ||
    actions.some(
      (action) =>
        action.actor.kind !== actor.kind ||
        action.actor.id !== actor.id ||
        action.channel !== 'mcp' ||
        action.generation !== undefined
    )
  )
    throw new DelegatedDraftHumanDecisionRequired();
}
