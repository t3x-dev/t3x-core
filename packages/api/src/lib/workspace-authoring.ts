import {
  compileDraftComposition,
  createDraftActionLedger,
  currentComposition,
  type DraftActionActor,
  type DraftActionChannel,
  type DraftActionGeneration,
  type DraftActionLedger,
  type DraftDocument,
  type DraftYOp,
  importLegacyDocument,
  listDraftActions,
  netDiffCards,
  nodeHistory,
  type PublishDraftActionResult,
  parseDraftActionLedger,
  publishDraftAction,
  selectedActionView,
} from '@t3x-dev/application';
import { createYOpsEffect, createYOpsState, describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  DraftAuthoringConflictError,
  findWorkspaceDraft,
  getTransitionProposalPreparation,
  getTransitionRefHead,
  listTransitionProposalsForWorkspace,
  NotFoundError,
  transactWorkspaceAuthoring,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';

export interface WorkspaceAuthoringBasis {
  schema: 't3x.application/workspace-authoring-basis/v1';
  refName: string;
  refHead: string | null;
  baseDigest: string;
  initialization: { requestId: string; facts: string };
}
export function workspaceAuthoringState(workspace: Record<string, unknown>) {
  const ledger = parseDraftActionLedger(workspace.authoringLedger);
  const basis = workspace.authoringBasis as WorkspaceAuthoringBasis;
  if (
    !basis ||
    basis.schema !== 't3x.application/workspace-authoring-basis/v1' ||
    !basis.refName ||
    basis.baseDigest !== describeTransitionObject(createYOpsState(ledger.base)).digest
  )
    throw new TypeError('Invalid pinned authoring basis');
  return { ledger, basis };
}

async function requireWorkspace(db: AnyDB, projectId: string, workspaceId: string) {
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state) throw new NotFoundError(workspaceId);
  return draft;
}

/** Repair an unbound authoring Workspace without changing its immutable history. */
export async function ensureWorkspaceAuthoringSchema(
  db: AnyDB,
  input: { projectId: string; workspaceId: string; expectedRevision?: number }
): Promise<number | undefined> {
  const initial = await requireWorkspace(db, input.projectId, input.workspaceId);
  const workspace = initial.workspace_state!;
  if (
    !workspace.authoringLedger ||
    (Array.isArray(workspace.schemaBindings) && workspace.schemaBindings.length > 0)
  )
    return input.expectedRevision;
  const { basis } = workspaceAuthoringState(workspace);
  const result = await transactWorkspaceAuthoring(
    db,
    { ...input, refName: basis.refName },
    async (_tx, draft) => {
      if (input.expectedRevision !== undefined && draft.revision !== input.expectedRevision)
        throw new ConflictError(draft.id, input.expectedRevision);
      const current = draft.workspace_state!;
      workspaceAuthoringState(current);
      if (draft.target_branch !== basis.refName)
        throw new DraftAuthoringConflictError('Target ref changed');
      if (Array.isArray(current.schemaBindings) && current.schemaBindings.length > 0)
        return { workspace: null, value: null };
      return {
        workspace: {
          ...current,
          schemaBindings: [
            { canonicalName: 't3x/prd', schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' },
          ],
        },
        value: null,
      };
    }
  );
  return result.draft.revision;
}

/** Explicit migration starts truthful history; legacy client blobs never become fake past actions. */
export async function initializeWorkspaceAuthoring(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    expectedWorkspaceRevision: number;
    expectedRefHead: string | null;
    actionId: string;
    actor: DraftActionActor;
    legacyDocument?: DraftDocument;
  }
) {
  const facts = canonicalizeProtocolValue(
    JSON.parse(JSON.stringify({ ...input, legacyDocument: input.legacyDocument ?? null }))
  );
  const initial = await requireWorkspace(db, input.projectId, input.workspaceId);
  const refName = initial.target_branch ?? 'main';
  return transactWorkspaceAuthoring(db, { ...input, refName }, async (tx, draft) => {
    const workspace = draft.workspace_state ?? {};
    if (workspace.authoringLedger) {
      const existing = workspaceAuthoringState(workspace);
      if (
        existing.basis.initialization?.requestId === input.actionId &&
        existing.basis.initialization.facts === facts
      )
        return { workspace: null, value: existing };
      throw new DraftAuthoringConflictError(
        'Workspace authoring is already initialized with different facts'
      );
    }
    if (draft.revision !== input.expectedWorkspaceRevision)
      throw new ConflictError(draft.id, input.expectedWorkspaceRevision);
    if (draft.target_branch !== refName)
      throw new DraftAuthoringConflictError('Target ref changed');
    const head = await getTransitionRefHead(tx, { projectId: input.projectId, refName });
    if (head.head !== input.expectedRefHead)
      throw new DraftAuthoringConflictError('Ref head changed');
    const base = head.format === 'empty' ? createYOpsState({}) : head.state;
    const operations = (workspace.yopsDraft as { operations?: unknown[] } | undefined)?.operations;
    const hasLegacyEdits = Boolean(
      operations?.length || draft.nodes?.length || draft.semantic_points?.length
    );
    const oldBase = workspace.baseCommitHash ?? draft.parent_commit_hash;
    if (oldBase != null && oldBase !== head.head && input.legacyDocument === undefined)
      throw new DraftAuthoringConflictError(
        'Legacy Draft basis changed; reconcile it before importing'
      );
    if (hasLegacyEdits && input.legacyDocument === undefined)
      throw new DraftAuthoringConflictError(
        'Existing Draft edits require an explicit legacy document import'
      );
    let ledger = createDraftActionLedger(base.value as DraftDocument);
    if (input.legacyDocument !== undefined) {
      const imported = importLegacyDocument({
        base: ledger.base,
        current: input.legacyDocument,
        actionId: input.actionId,
        actor: input.actor,
        publishedAt: new Date().toISOString(),
        reason: 'Explicit legacy Draft snapshot import; prior authorship is unknown',
      });
      if (imported.kind !== 'published' && imported.kind !== 'no_change')
        throw new DraftAuthoringConflictError('Legacy snapshot could not be imported');
      ledger = imported.ledger;
    }
    const basis: WorkspaceAuthoringBasis = {
      schema: 't3x.application/workspace-authoring-basis/v1',
      refName,
      refHead: head.head,
      baseDigest: describeTransitionObject(base).digest,
      initialization: { requestId: input.actionId, facts },
    };
    return {
      workspace: { ...workspace, authoringLedger: ledger, authoringBasis: basis },
      value: { basis, ledger },
    };
  });
}

/** Shared Draft boundary: provenance, freshness and deterministic replay; detailed checks run in Review. */
export async function publishWorkspaceAuthoringAction(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    actionId: string;
    actor: DraftActionActor;
    channel: DraftActionChannel;
    operations: DraftYOp[];
    expectedRevision: number;
    expectedWorkspaceRevision: number;
    expectedRefHead: string | null;
    reason?: string;
    generation?: DraftActionGeneration;
    validate?: (tx: AnyDB) => Promise<void>;
  }
) {
  const initial = await requireWorkspace(db, input.projectId, input.workspaceId);
  const { basis } = workspaceAuthoringState(initial.workspace_state!);
  return transactWorkspaceAuthoring<PublishDraftActionResult>(
    db,
    { ...input, refName: basis.refName },
    async (tx, draft) => {
      const workspace = draft.workspace_state!;
      const current = workspaceAuthoringState(workspace);
      const { validate: _validate, ...command } = input;
      const result = publishDraftAction(current.ledger, {
        ...command,
        publishedAt: new Date().toISOString(),
        precondition: {
          workspaceRevision: input.expectedWorkspaceRevision,
          refHead: input.expectedRefHead,
        },
      });
      // Recover a successful operation before checking its now-stale preconditions.
      if (
        result.kind === 'reused' ||
        (result.kind === 'no_change' && result.ledger === current.ledger)
      )
        return { workspace: null, value: result };
      if (result.kind === 'conflict' || result.kind === 'rejected')
        throw new DraftAuthoringConflictError(result.message);
      if (draft.revision !== input.expectedWorkspaceRevision)
        throw new ConflictError(draft.id, input.expectedWorkspaceRevision);
      const head = await getTransitionRefHead(tx, {
        projectId: input.projectId,
        refName: basis.refName,
      });
      if (
        head.head !== input.expectedRefHead ||
        head.head !== current.basis.refHead ||
        draft.target_branch !== current.basis.refName
      )
        throw new DraftAuthoringConflictError(
          'Pinned ref head changed; explicit reconciliation is required'
        );
      if (input.channel === 'assistant' && !input.generation)
        throw new DraftAuthoringConflictError(
          'Generated publication requires server-bound provenance'
        );
      await input.validate?.(tx);
      // Revalidate the complete ordered Effect against protocol Base. Never use effective Draft as Effect.base.
      const composed = buildAuthoringEffect(result.ledger);
      if (
        describeTransitionObject(composed.result).digest !==
        describeTransitionObject(createYOpsState(currentComposition(result.ledger))).digest
      )
        throw new TypeError('Authoring replay mismatch');
      return { workspace: { ...workspace, authoringLedger: result.ledger }, value: result };
    }
  );
}

export function buildAuthoringEffect(ledger: DraftActionLedger) {
  const base = createYOpsState(ledger.base);
  const compiled = compileDraftComposition(ledger);
  const built = createYOpsEffect({
    base,
    expectedBase: describeTransitionObject(base),
    operations: JSON.parse(JSON.stringify(compiled.operations)),
  });
  return { ...built, bindings: compiled.bindings };
}

export async function readWorkspaceAuthoring(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    actionId?: string;
    nodeId?: string;
    beforeSequence?: number;
    limit?: number;
  }
) {
  const draft = await requireWorkspace(db, input.projectId, input.workspaceId);
  const { ledger, basis } = workspaceAuthoringState(draft.workspace_state!);
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const actions = listDraftActions(ledger)
    .filter((a) => input.beforeSequence === undefined || a.sequence < input.beforeSequence)
    .slice(0, limit);
  const selected = selectedActionView(ledger, input.actionId);
  if (input.actionId && !selected) throw new NotFoundError(input.actionId);
  const { pendingCandidates, candidateWindowTruncated } = await readWorkspaceAuthoringCandidates(
    db,
    { ...input, ledger, workspaceRevision: draft.revision }
  );
  const history = input.nodeId ? nodeHistory(ledger, input.nodeId, input.actionId) : null;
  return {
    schema: 't3x.application/workspace-authoring-view/v1' as const,
    projectionVersion: 1,
    workspaceRevision: draft.revision,
    compositionRevision: ledger.compositionRevision,
    basis: { refName: basis.refName, refHead: basis.refHead, baseDigest: basis.baseDigest },
    sources: (Array.isArray(draft.workspace_state?.sourceBundle)
      ? draft.workspace_state.sourceBundle
      : []
    ).map((source) => ({
      id: source.id,
      title: source.title,
      type: source.type,
      materialId: source.materialId,
      conversationId: source.conversationId,
    })),
    pendingCandidates,
    candidateWindowTruncated,
    actions: actions.map((action) => {
      const cards = selectedActionView(ledger, action.actionId)!.cards;
      return {
        ...action,
        affectedNodeCount: cards.length,
        affectedNodeIds: cards.map((card) => card.nodeId),
      };
    }),
    nextBeforeSequence: actions.length === limit ? actions.at(-1)!.sequence : null,
    selected,
    base: ledger.base,
    current: currentComposition(ledger),
    netDiff: netDiffCards(ledger),
    node: history
      ? {
          ...history,
          entries: history.entries
            .filter((e) => input.beforeSequence === undefined || e.sequence < input.beforeSequence)
            .slice(0, limit),
        }
      : null,
  };
}

export async function readWorkspaceAuthoringCandidates(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    workspaceRevision: number;
    ledger: DraftActionLedger;
  }
) {
  const published = new Set(input.ledger.actions.map((action) => action.generation?.transitionId));
  const memberships = await listTransitionProposalsForWorkspace(db, input);
  const pendingCandidates = (
    await Promise.all(
      memberships
        .filter((item) => !published.has(item.transitionId))
        .map(async (item) => {
          const preparation = await getTransitionProposalPreparation(db, item.transitionId);
          if (
            !preparation ||
            JSON.parse(preparation.canonicalJson).schema !==
              't3x.application/workspace-generation-preparation/v1'
          )
            return null;
          return {
            transitionId: item.transitionId,
            workspaceRevision: item.workspaceRevision,
            createdAt: item.createdAt,
            status:
              item.workspaceRevision === input.workspaceRevision
                ? ('candidate' as const)
                : ('stale' as const),
          };
        })
    )
  ).filter((item) => item !== null);
  return { pendingCandidates, candidateWindowTruncated: memberships.length === 100 };
}

/** Application audit linkage; no authoring fields are added to protocol envelopes. */
export function buildAuthoringPreparation(workspace: Record<string, unknown>) {
  const { ledger, basis } = workspaceAuthoringState(workspace);
  return {
    schema: 't3x.application/workspace-authoring-preparation/v1' as const,
    version: 1 as const,
    ledger,
    basis,
    bindings: buildAuthoringEffect(ledger).bindings,
  };
}

export function assertWorkspaceAuthoringReview(
  workspace: Record<string, unknown>,
  graph: import('@t3x-dev/storage').ResolvedTransitionProposalGraph
) {
  if (!workspace.authoringLedger) return;
  const frozen = buildAuthoringPreparation(workspace);
  const built = buildAuthoringEffect(frozen.ledger);
  const preparation = graph.preparation ? JSON.parse(graph.preparation.canonicalJson) : null;
  if (
    !preparation ||
    canonicalizeProtocolValue(preparation) !==
      canonicalizeProtocolValue(JSON.parse(JSON.stringify(frozen))) ||
    describeTransitionObject(graph.effect).digest !== describeTransitionObject(built.effect).digest
  )
    throw new DraftAuthoringConflictError(
      'Review must bind the complete current Draft and its authoring manifest'
    );
}
