import {
  AssistantSchemaSettingsViewSchema,
  WorkspaceSchemaDefinitionSnapshotSchema,
} from '@t3x-dev/api-client';
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
  replayToRevision,
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
  transactWorkspaceReconciliation,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';
import {
  DELETION_AUTHORIZATIONS,
  deletionAuthorizations,
  deletionSubject,
  matchingDeletionAuthorization,
} from './workspace-deletion-authorization';
import { workspaceDocumentRootKey } from './workspace-schema-content';
import {
  buildWorkspaceSchemaReview,
  captureWorkspaceSchema,
  committedWorkspaceSchemaAtHead,
  workspaceSchemaReviewHasChanges,
} from './workspace-schema-review';
import { schemaRootKeyFromBinding } from './yschema-registry';

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

const bindingRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function repairedSchemaBindings(workspace: Record<string, unknown>): unknown[] | null {
  const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
  const { ledger } = workspaceAuthoringState(workspace);
  const inferredRootKey = workspaceDocumentRootKey(currentComposition(ledger));
  if (bindings.length === 0) return null;
  const binding = bindings[0];
  if (
    bindings.length !== 1 ||
    !inferredRootKey ||
    !bindingRecord(binding) ||
    (typeof binding.rootKey === 'string' && /^[a-z][a-z0-9_]*$/.test(binding.rootKey)) ||
    schemaRootKeyFromBinding(binding) === inferredRootKey
  )
    return null;
  return [{ ...binding, rootKey: inferredRootKey }];
}

/**
 * Shared freshness gate for every supported Workspace write surface.
 * Identity is authorized by the HTTP boundary; this function binds the typed
 * command to the exact persisted Workspace, composition and target ref.
 */
export async function assertWorkspaceAuthoringCommandBasis(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    expectedWorkspaceRevision: number;
    expectedRevision: number;
    expectedRefHead: string | null;
  }
) {
  const draft = await requireWorkspace(db, input.projectId, input.workspaceId);
  const current = workspaceAuthoringState(draft.workspace_state!);
  if (draft.revision !== input.expectedWorkspaceRevision)
    throw new ConflictError(draft.id, input.expectedWorkspaceRevision);
  if (current.ledger.compositionRevision !== input.expectedRevision)
    throw new DraftAuthoringConflictError(
      `Expected revision ${input.expectedRevision}, current is ${current.ledger.compositionRevision}`
    );
  const head = await getTransitionRefHead(db, {
    projectId: input.projectId,
    refName: current.basis.refName,
  });
  if (
    current.basis.refHead !== input.expectedRefHead ||
    head.head !== input.expectedRefHead ||
    draft.target_branch !== current.basis.refName
  )
    throw new DraftAuthoringConflictError(
      'Pinned ref head changed; explicit reconciliation is required'
    );
  return { draft, ...current };
}

/** Restore only the verified committed Schema; never guess from a UI default. */
export async function ensureWorkspaceAuthoringSchema(
  db: AnyDB,
  input: { projectId: string; workspaceId: string; expectedRevision?: number }
): Promise<number | undefined> {
  const initial = await requireWorkspace(db, input.projectId, input.workspaceId);
  const workspace = initial.workspace_state!;
  if (!workspace.authoringLedger) return input.expectedRevision;
  const { basis } = workspaceAuthoringState(workspace);
  const repairRoot = repairedSchemaBindings(workspace);
  const restoreCommittedSchema =
    basis.refHead !== null &&
    (!Array.isArray(workspace.schemaBindings) || workspace.schemaBindings.length === 0) &&
    !workspace.schemaEditCandidate &&
    !workspace.schemaPending;
  if (!repairRoot && !restoreCommittedSchema) return input.expectedRevision;
  const result = await transactWorkspaceAuthoring(
    db,
    { ...input, refName: basis.refName },
    async (tx, draft) => {
      if (input.expectedRevision !== undefined && draft.revision !== input.expectedRevision)
        throw new ConflictError(draft.id, input.expectedRevision);
      const current = draft.workspace_state!;
      const currentState = workspaceAuthoringState(current);
      if (draft.target_branch !== basis.refName)
        throw new DraftAuthoringConflictError('Target ref changed');
      let schemaBindings = repairedSchemaBindings(current);
      let workspaceSchemaBase = current.workspaceSchemaBase;
      if (
        currentState.basis.refHead !== null &&
        (!Array.isArray(current.schemaBindings) || current.schemaBindings.length === 0) &&
        !current.schemaEditCandidate &&
        !current.schemaPending
      ) {
        const stored = current.workspaceSchemaBase as
          | { refHead?: unknown; snapshot?: unknown }
          | undefined;
        const storedSnapshot =
          stored?.refHead === currentState.basis.refHead && stored.snapshot !== undefined
            ? WorkspaceSchemaDefinitionSnapshotSchema.parse(stored.snapshot)
            : null;
        const committed = await committedWorkspaceSchemaAtHead(
          tx,
          input.projectId,
          currentState.basis.refName,
          currentState.basis.refHead,
          storedSnapshot ?? (await captureWorkspaceSchema(tx, input.projectId, current))
        );
        if (committed.status === 'bound') {
          schemaBindings = structuredClone(committed.bindings);
          workspaceSchemaBase = {
            refHead: currentState.basis.refHead,
            snapshot: structuredClone(committed),
          };
        }
      }
      if (!schemaBindings) return { workspace: null, value: null };
      return {
        workspace: {
          ...current,
          schemaBindings,
          ...(workspaceSchemaBase === undefined ? {} : { workspaceSchemaBase }),
        },
        value: null,
      };
    }
  );
  return result.draft.revision;
}

export async function synchronizeUninitializedWorkspace(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    requestId: string;
    actor: DraftActionActor;
    refName: string;
    refHead: string;
    expectedWorkspaceRevision: number;
    initializationFacts?: string;
  }
) {
  const facts =
    input.initializationFacts ?? canonicalizeProtocolValue(JSON.parse(JSON.stringify(input)));
  return transactWorkspaceReconciliation<
    | { kind: 'pending' }
    | { kind: 'reconciled'; basis: WorkspaceAuthoringBasis; ledger: DraftActionLedger }
  >(db, input, async (tx, draft) => {
    const workspace = draft.workspace_state;
    if (!workspace) throw new NotFoundError(input.workspaceId);
    if (draft.revision !== input.expectedWorkspaceRevision)
      throw new ConflictError(draft.id, input.expectedWorkspaceRevision);
    if (draft.target_branch !== input.refName)
      throw new DraftAuthoringConflictError('Target ref changed');
    const operations = (workspace.yopsDraft as { operations?: unknown[] } | undefined)?.operations;
    if (
      operations?.length ||
      draft.nodes?.length ||
      draft.semantic_points?.length ||
      workspace.schemaEditCandidate ||
      workspace.schemaPending
    )
      return { workspace: null, value: { kind: 'pending' as const } };
    const head = await getTransitionRefHead(tx, {
      projectId: input.projectId,
      refName: input.refName,
    });
    if (head.head !== input.refHead)
      throw new DraftAuthoringConflictError('Branch changed again; refresh before syncing');
    const document = head.state.value as DraftDocument;
    const previousSchema = await captureWorkspaceSchema(tx, input.projectId, workspace);
    const schema = await committedWorkspaceSchemaAtHead(
      tx,
      input.projectId,
      input.refName,
      input.refHead,
      previousSchema
    );
    const ledger = createDraftActionLedger(document);
    const basis: WorkspaceAuthoringBasis = {
      schema: 't3x.application/workspace-authoring-basis/v1',
      refName: input.refName,
      refHead: input.refHead,
      baseDigest: describeTransitionObject(createYOpsState(document)).digest,
      initialization: { requestId: input.requestId, facts },
    };
    return {
      workspace: {
        ...workspace,
        authoringLedger: ledger,
        authoringBasis: basis,
        baseCommitHash: input.refHead,
        schemaBindings: structuredClone(schema.bindings),
        workspaceSchemaBase: { refHead: input.refHead, snapshot: structuredClone(schema) },
        authoringReconciliations: [
          ...((workspace.authoringReconciliations ?? []) as unknown[]),
          {
            requestId: input.requestId,
            facts,
            reconciledAt: new Date().toISOString(),
            actor: input.actor,
            workspaceRevision: draft.revision,
            basis: workspace.authoringBasis,
            ledger: workspace.authoringLedger,
            schemaBindings: workspace.schemaBindings,
            workspaceSchemaBase: workspace.workspaceSchemaBase,
            nextRefHead: input.refHead,
          },
        ],
      },
      value: { kind: 'reconciled' as const, basis, ledger },
    };
  });
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
  if (!initial.workspace_state?.authoringLedger && input.legacyDocument === undefined) {
    const head = await getTransitionRefHead(db, { projectId: input.projectId, refName });
    if (head.head !== null && head.head !== input.expectedRefHead) {
      const synchronized = await synchronizeUninitializedWorkspace(db, {
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        requestId: input.actionId,
        actor: input.actor,
        refName,
        refHead: head.head,
        expectedWorkspaceRevision: input.expectedWorkspaceRevision,
        initializationFacts: facts,
      });
      if (synchronized.value.kind === 'reconciled')
        return {
          ...synchronized,
          value: {
            basis: synchronized.value.basis,
            ledger: synchronized.value.ledger,
          },
        };
      throw new DraftAuthoringConflictError(
        'Ref head changed; reconcile the existing Draft before importing it'
      );
    }
  }
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
    const committedSchema =
      head.format === 'empty' || workspace.workspaceSchemaBase !== undefined
        ? null
        : await committedWorkspaceSchemaAtHead(
            tx,
            input.projectId,
            refName,
            head.head,
            await captureWorkspaceSchema(tx, input.projectId, workspace)
          );
    const workspaceSchemaBase =
      workspace.workspaceSchemaBase ??
      (committedSchema
        ? { refHead: head.head, snapshot: structuredClone(committedSchema) }
        : undefined);
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
      workspace: {
        ...workspace,
        authoringLedger: ledger,
        authoringBasis: basis,
        ...(committedSchema === null
          ? {}
          : { schemaBindings: structuredClone(committedSchema.bindings) }),
        ...(workspaceSchemaBase === undefined ? {} : { workspaceSchemaBase }),
      },
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

/** Explicit human button, never an assistant tool. Authorization changes no content or history. */
export async function confirmWorkspaceDeletion(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    actionId: string;
    actor: DraftActionActor;
    expectedWorkspaceRevision: number;
    expectedRevision: number;
    expectedRefHead: string | null;
  }
) {
  if (input.actor.kind !== 'human')
    throw new DraftAuthoringConflictError('Deletion confirmation requires a human principal');
  const initial = await requireWorkspace(db, input.projectId, input.workspaceId);
  const { basis } = workspaceAuthoringState(initial.workspace_state!);
  return transactWorkspaceAuthoring(db, { ...input, refName: basis.refName }, async (tx, draft) => {
    const workspace = draft.workspace_state!;
    const current = workspaceAuthoringState(workspace);
    const action = current.ledger.actions.find((entry) => entry.actionId === input.actionId);
    if (!action) throw new NotFoundError(input.actionId);
    const subject = deletionSubject(
      input.projectId,
      input.workspaceId,
      current.basis,
      current.ledger,
      action
    );
    if (!subject)
      throw new DraftAuthoringConflictError(
        'Only an exact generated deletion can be confirmed here'
      );
    const receipts = deletionAuthorizations(workspace);
    const previous = matchingDeletionAuthorization(receipts, subject);
    if (previous) return { workspace: null, value: previous };
    const head = await getTransitionRefHead(tx, {
      projectId: input.projectId,
      refName: current.basis.refName,
    });
    if (
      draft.revision !== input.expectedWorkspaceRevision ||
      current.ledger.compositionRevision !== input.expectedRevision ||
      current.basis.refHead !== input.expectedRefHead ||
      head.head !== input.expectedRefHead ||
      draft.target_branch !== current.basis.refName
    )
      throw new DraftAuthoringConflictError(
        'Draft or branch changed; refresh before confirming deletion'
      );
    const receipt = {
      schema: 't3x.application/deletion-authorization/v1' as const,
      subjectDigest: subject.digest,
      actionId: action.actionId,
      paths: subject.paths,
      actor: input.actor,
      confirmedAt: new Date().toISOString(),
    };
    return {
      workspace: { ...workspace, [DELETION_AUTHORIZATIONS]: [...receipts, receipt] },
      value: receipt,
    };
  });
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
  const head = await getTransitionRefHead(db, {
    projectId: input.projectId,
    refName: basis.refName,
  });
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
  // Resolve from the same Workspace revision as current content, including
  // immutable prepared snapshots. A missing contract must not hide Draft activity.
  const schemaReview = await buildWorkspaceSchemaReview(
    db,
    input.projectId,
    draft.workspace_state!
  ).catch((error: unknown) => {
    if (!(error instanceof DraftAuthoringConflictError)) throw error;
    return null;
  });
  const currentSchema =
    schemaReview?.draft ??
    (await captureWorkspaceSchema(db, input.projectId, draft.workspace_state!).catch(
      (error: unknown) => {
        if (!(error instanceof DraftAuthoringConflictError)) throw error;
        return { status: 'unknown' as const, schemaHash: null, definition: null, bindings: [] };
      }
    ));
  return {
    schema: 't3x.application/workspace-authoring-view/v1' as const,
    projectionVersion: 1,
    workspaceRevision: draft.revision,
    compositionRevision: ledger.compositionRevision,
    basis: { refName: basis.refName, refHead: basis.refHead, baseDigest: basis.baseDigest },
    synchronization: { currentRefHead: head.head, required: head.head !== basis.refHead },
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
      const subject = deletionSubject(input.projectId, input.workspaceId, basis, ledger, action);
      return {
        ...action,
        ...(subject
          ? {
              deletionConfirmation: {
                status: matchingDeletionAuthorization(
                  deletionAuthorizations(draft.workspace_state!),
                  subject
                )
                  ? ('confirmed' as const)
                  : ('required' as const),
                paths: subject.paths,
              },
            }
          : {}),
        affectedNodeCount: cards.length,
        affectedNodeIds: cards.map((card) => card.nodeId),
      };
    }),
    nextBeforeSequence: actions.length === limit ? actions.at(-1)!.sequence : null,
    selected: selected
      ? {
          ...selected,
          before: replayToRevision(ledger, selected.action.beforeRevision),
          after: replayToRevision(ledger, selected.action.afterRevision),
        }
      : null,
    base: ledger.base,
    current: currentComposition(ledger),
    currentSchema,
    hasChanges: schemaReview ? workspaceSchemaReviewHasChanges(schemaReview) : undefined,
    schemaHasChanges:
      schemaReview &&
      schemaReview.base.status !== 'unknown' &&
      schemaReview.draft.status !== 'unknown'
        ? schemaReview.base.status !== schemaReview.draft.status ||
          schemaReview.base.schemaHash !== schemaReview.draft.schemaHash
        : undefined,
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
  const schemaCards = (
    Array.isArray(workspace.schemaPreparations) ? workspace.schemaPreparations : []
  ).flatMap((entry) => {
    const parsed = AssistantSchemaSettingsViewSchema.safeParse(entry.schemaCard);
    return parsed.success &&
      parsed.data.status === 'applied' &&
      entry.requestId === `assistant-schema:${parsed.data.settingsId}` &&
      parsed.data.snapshot?.schemaHash === entry.schemaHash
      ? [parsed.data]
      : [];
  });
  return {
    schema: 't3x.application/workspace-authoring-preparation/v1' as const,
    version: 1 as const,
    ledger,
    basis,
    bindings: buildAuthoringEffect(ledger).bindings,
    ...(Array.isArray(workspace.authoringReconciliations)
      ? { reconciliations: workspace.authoringReconciliations }
      : {}),
    schemaBindings: workspace.schemaBindings ?? [],
    sourceBundle: Array.isArray(workspace.sourceBundle)
      ? structuredClone(workspace.sourceBundle)
      : [],
    deletionAuthorizations: deletionAuthorizations(workspace),
    workspaceSchemaBase: workspace.workspaceSchemaBase ?? null,
    ...(schemaCards.length ? { schemaCards } : {}),
  };
}

export interface WorkspaceAuthoringHistoryEntry {
  schema: 't3x.application/workspace-authoring-history-entry/v1';
  commitDigest: string;
  committedAt: string;
  transitionId: string;
  preparationDigest: string | null;
  compositionRevision: number;
  basis: WorkspaceAuthoringBasis;
  schemaHash?: string | null;
}

/** Recover the frozen ledger of a committed round whose basis matches, from its Commit preparation. */
export async function findRetiredAuthoringLedger(
  db: AnyDB,
  workspace: Record<string, unknown>,
  basis: unknown
): Promise<DraftActionLedger | null> {
  const history = Array.isArray(workspace.authoringHistory)
    ? (workspace.authoringHistory as WorkspaceAuthoringHistoryEntry[])
    : [];
  const canonicalBasis = canonicalizeProtocolValue(JSON.parse(JSON.stringify(basis ?? null)));
  const reconciliations = (workspace.authoringReconciliations ?? []) as Array<{
    basis: unknown;
    ledger: unknown;
  }>;
  const archived = reconciliations.find(
    (entry) => canonicalizeProtocolValue(JSON.parse(JSON.stringify(entry.basis))) === canonicalBasis
  );
  if (archived) return parseDraftActionLedger(archived.ledger);
  const entry = history.find(
    (item) => canonicalizeProtocolValue(JSON.parse(JSON.stringify(item.basis))) === canonicalBasis
  );
  if (!entry) return null;
  const preparation = await getTransitionProposalPreparation(db, entry.transitionId);
  if (!preparation || preparation.digest !== entry.preparationDigest)
    throw new DraftAuthoringConflictError('Committed authoring manifest is unavailable');
  return parseDraftActionLedger(JSON.parse(preparation.canonicalJson).ledger);
}

/** Retire the committed ledger by reference and pin a fresh one at the new Commit result. */
export function renewWorkspaceAuthoringState(
  workspace: Record<string, unknown>,
  input: {
    commitDigest: string;
    committedAt: string;
    transitionId: string;
    preparationDigest: string | null;
    result: ReturnType<typeof createYOpsState>;
    schemaBase?: import('@t3x-dev/api-client').WorkspaceSchemaDefinitionSnapshot;
  }
): Record<string, unknown> {
  const { ledger, basis } = workspaceAuthoringState(workspace);
  const history = Array.isArray(workspace.authoringHistory) ? workspace.authoringHistory : [];
  const entry: WorkspaceAuthoringHistoryEntry = {
    schema: 't3x.application/workspace-authoring-history-entry/v1',
    commitDigest: input.commitDigest,
    committedAt: input.committedAt,
    transitionId: input.transitionId,
    preparationDigest: input.preparationDigest,
    compositionRevision: ledger.compositionRevision,
    basis,
    ...(input.schemaBase ? { schemaHash: input.schemaBase.schemaHash } : {}),
  };
  const nextBasis: WorkspaceAuthoringBasis = {
    schema: 't3x.application/workspace-authoring-basis/v1',
    refName: basis.refName,
    refHead: input.commitDigest,
    baseDigest: describeTransitionObject(input.result).digest,
    initialization: {
      requestId: `commit:${input.commitDigest}`,
      facts: canonicalizeProtocolValue({ renewedFrom: input.commitDigest }),
    },
  };
  const {
    assistantSchemaSettings: _settings,
    schemaPreparations: _preparations,
    schemaPending: _pending,
    ...nextWorkspace
  } = workspace;
  return {
    ...nextWorkspace,
    authoringHistory: [...history, entry],
    authoringLedger: createDraftActionLedger(input.result.value as DraftDocument),
    authoringBasis: nextBasis,
    baseCommitHash: input.commitDigest,
    ...(input.schemaBase
      ? { workspaceSchemaBase: { refHead: input.commitDigest, snapshot: input.schemaBase } }
      : {}),
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
  const { schemaReview: _schemaReview, ...manifest } = preparation ?? {};
  if (
    !preparation ||
    canonicalizeProtocolValue(manifest) !==
      canonicalizeProtocolValue(JSON.parse(JSON.stringify(frozen))) ||
    describeTransitionObject(graph.effect).digest !== describeTransitionObject(built.effect).digest
  )
    throw new DraftAuthoringConflictError(
      'Review must bind the complete current Draft and its authoring manifest'
    );
}
