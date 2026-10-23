import {
  AssistantSchemaSettingsViewSchema,
  type WorkspaceCommitChanges,
} from '@t3x-dev/api-client';
import {
  listDraftActions,
  netDiffCards,
  parseDraftActionLedger,
  replayToRevision,
  selectedActionView,
} from '@t3x-dev/application';
import { describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  DraftAuthoringConflictError,
  findTransitionCommitReceipt,
  getRepositoryDecisionAuditByDigest,
  getVerifiedTransitionCommitGraph,
  resolveTransitionProposalGraph,
} from '@t3x-dev/storage';
import { diffYSchemas, normalizeYSchemaObject } from '@t3x-dev/yschema';
import { buildAuthoringEffect } from './workspace-authoring';
import {
  frozenWorkspaceSchemaReview,
  recoverCommittedSchema,
  unboundWorkspaceSchema,
} from './workspace-schema-review';

/** Read only immutable Commit evidence. Never consult the live Workspace. */
export async function readCommitChanges(
  db: AnyDB,
  projectId: string,
  commitDigest: string,
  beforeSequence?: number
): Promise<WorkspaceCommitChanges | null> {
  const committed = await getVerifiedTransitionCommitGraph(db, projectId, commitDigest);
  if (!committed) return null;
  const receipt = await findTransitionCommitReceipt(db, projectId, commitDigest);
  const graph = receipt
    ? await resolveTransitionProposalGraph(db, projectId, receipt.transitionId, false)
    : null;
  if (
    graph &&
    describeTransitionObject(graph.proposal).digest !==
      describeTransitionObject(committed.proposal).digest
  )
    throw new DraftAuthoringConflictError('Commit preparation does not match its Proposal');
  const preparation = graph?.preparation ? JSON.parse(graph.preparation.canonicalJson) : null;
  const ledger =
    preparation?.schema === 't3x.application/workspace-authoring-preparation/v1'
      ? parseDraftActionLedger(preparation.ledger)
      : null;
  if (
    ledger &&
    describeTransitionObject(buildAuthoringEffect(ledger).effect).digest !==
      describeTransitionObject(committed.effect).digest
  )
    throw new DraftAuthoringConflictError('Committed authoring manifest does not match its Effect');
  const actions = ledger
    ? listDraftActions(ledger)
        .filter((action) => beforeSequence === undefined || action.sequence < beforeSequence)
        .slice(0, 20)
    : [];
  let schemaReview = graph ? frozenWorkspaceSchemaReview(graph) : null;
  if (!schemaReview) {
    const recover = async (hash: string, decisionDigest: string) => {
      const audit = await getRepositoryDecisionAuditByDigest(db, projectId, decisionDigest);
      return audit
        ? recoverCommittedSchema(db, projectId, audit.refName, hash, unboundWorkspaceSchema())
        : null;
    };
    const draft = await recover(commitDigest, committed.commit.decision.digest);
    const parentHash = committed.commit.parents[0]?.digest;
    const parent = parentHash
      ? await getVerifiedTransitionCommitGraph(db, projectId, parentHash)
      : null;
    const base =
      parent && describeTransitionObject(parent.state).digest === committed.effect.base.digest
        ? await recover(parentHash!, parent.commit.decision.digest)
        : null;
    if (draft)
      schemaReview = {
        schema: 't3x.application/workspace-schema-review/v1',
        base: base ?? { status: 'unknown', definition: null, schemaHash: null, bindings: [] },
        draft,
        changes:
          base?.definition && draft.definition
            ? diffYSchemas(
                normalizeYSchemaObject(base.definition),
                normalizeYSchemaObject(draft.definition)
              )
            : [],
        actionCount: 0,
        baseContent: committed.base.value,
        draftContent: committed.state.value,
      };
  }
  return {
    projectId,
    commitDigest,
    committedAt: committed.recordedAt,
    source: ledger ? 'authoring' : 'commit_diff',
    base: committed.base.value,
    current: committed.state.value,
    actions: actions.map((action) => ({
      action: { ...action, operations: JSON.parse(JSON.stringify(action.operations)) },
      cards: [...selectedActionView(ledger!, action.actionId)!.cards],
      before: replayToRevision(ledger!, action.beforeRevision),
      after: replayToRevision(ledger!, action.afterRevision),
    })),
    nextBeforeSequence: actions.length === 20 ? actions.at(-1)!.sequence : null,
    netDiff: ledger
      ? [...netDiffCards(ledger)]
      : [
          {
            nodeId: commitDigest,
            path: '',
            before: committed.base.value,
            after: committed.state.value,
          },
        ],
    schemaCards: (preparation?.schemaCards ?? []).map((card: unknown) =>
      AssistantSchemaSettingsViewSchema.parse(card)
    ),
    schemaReview,
  };
}
