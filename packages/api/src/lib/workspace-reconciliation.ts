import { isDeepStrictEqual } from 'node:util';
import {
  createDraftActionLedger,
  currentComposition,
  type DraftActionActor,
  type DraftDocument,
  importLegacyDocument,
} from '@t3x-dev/application';
import { createYOpsState, describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  DraftAuthoringConflictError,
  findWorkspaceDraft,
  getTransitionRefHead,
  listWorkspaceDrafts,
  NotFoundError,
  transactWorkspaceReconciliation,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';
import {
  buildAuthoringEffect,
  type WorkspaceAuthoringBasis,
  workspaceAuthoringState,
} from './workspace-authoring';

/** Conservative three-way merge. Arrays are atomic: positional guesses can lose edits. */
export function reconcileDocuments(
  base: DraftDocument,
  local: DraftDocument,
  remote: DraftDocument
) {
  const conflicts: string[] = [];
  type Value = DraftDocument | undefined;
  const mapping = (value: Value): value is Record<string, DraftDocument> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  function merge(before: Value, ours: Value, theirs: Value, path: string): Value {
    if (isDeepStrictEqual(ours, before)) return theirs;
    if (isDeepStrictEqual(theirs, before) || isDeepStrictEqual(ours, theirs)) return ours;
    if (mapping(before) && mapping(ours) && mapping(theirs)) {
      const entries: Array<[string, DraftDocument]> = [];
      for (const key of [
        ...new Set([...Object.keys(before), ...Object.keys(ours), ...Object.keys(theirs)]),
      ].sort()) {
        const own = (value: Record<string, DraftDocument>) =>
          Object.hasOwn(value, key) ? value[key] : undefined;
        const next = merge(
          own(before),
          own(ours),
          own(theirs),
          `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`
        );
        if (next !== undefined) entries.push([key, next]);
      }
      return Object.fromEntries(entries);
    }
    conflicts.push(path || '/');
    return ours;
  }
  const current = merge(base, local, remote, '') as DraftDocument;
  return { current, conflicts };
}

export async function reconcileWorkspaceAuthoring(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    requestId: string;
    actor: DraftActionActor;
    expectedWorkspaceRevision: number;
    expectedRefHead: string | null;
    onlyIfClean?: boolean;
  }
) {
  const initial = await findWorkspaceDraft(db, input.projectId, input.workspaceId);
  if (!initial?.workspace_state) throw new NotFoundError(input.workspaceId);
  const { basis } = workspaceAuthoringState(initial.workspace_state);
  const facts = canonicalizeProtocolValue(JSON.parse(JSON.stringify(input)));
  return transactWorkspaceReconciliation<{
    kind: 'reused' | 'no_change' | 'pending' | 'reconciled';
  }>(db, { ...input, refName: basis.refName }, async (tx, draft) => {
    const workspace = draft.workspace_state!;
    const current = workspaceAuthoringState(workspace);
    const history = (workspace.authoringReconciliations ?? []) as Array<Record<string, unknown>>;
    const receipt = history.find((entry) => entry.requestId === input.requestId);
    if (receipt) {
      if (receipt.facts !== facts)
        throw new DraftAuthoringConflictError(
          'Reconciliation request was reused with different facts'
        );
      return { workspace: null, value: { kind: 'reused' as const } };
    }
    if (draft.revision !== input.expectedWorkspaceRevision)
      throw new ConflictError(draft.id, input.expectedWorkspaceRevision);
    if (draft.target_branch !== basis.refName || current.basis.refName !== basis.refName)
      throw new DraftAuthoringConflictError('Target ref changed');
    const head = await getTransitionRefHead(tx, {
      projectId: input.projectId,
      refName: basis.refName,
    });
    if (head.head !== input.expectedRefHead)
      throw new DraftAuthoringConflictError('Branch changed again; refresh before syncing');
    if (head.head === current.basis.refHead)
      return { workspace: null, value: { kind: 'no_change' as const } };
    const local = currentComposition(current.ledger);
    if (input.onlyIfClean && !isDeepStrictEqual(local, current.ledger.base))
      return { workspace: null, value: { kind: 'pending' as const } };
    const base = head.format === 'empty' ? createYOpsState({}) : head.state;
    const merged = reconcileDocuments(current.ledger.base, local, base.value as DraftDocument);
    if (merged.conflicts.length)
      throw new DraftAuthoringConflictError(
        `Cannot sync overlapping changes at ${merged.conflicts.join(', ')}. Your Workspace edits are unchanged.`
      );
    const reconciledAt = new Date().toISOString();
    let ledger = createDraftActionLedger(base.value as DraftDocument);
    if (!isDeepStrictEqual(merged.current, base.value)) {
      const imported = importLegacyDocument({
        base: ledger.base,
        current: merged.current,
        actionId: `reconcile:${input.requestId}`,
        actor: input.actor,
        publishedAt: reconciledAt,
        reason:
          'Carry forward Workspace edits after branch synchronization; original actions are retained in the reconciliation archive',
      });
      if (imported.kind !== 'published' && imported.kind !== 'no_change')
        throw new DraftAuthoringConflictError('Workspace edits could not be carried forward');
      ledger = imported.ledger;
    }
    // Rebuild and verify the full Effect on the new Base before any write.
    if (!isDeepStrictEqual(buildAuthoringEffect(ledger).result.value, merged.current))
      throw new TypeError('Reconciled authoring replay mismatch');
    const nextBasis: WorkspaceAuthoringBasis = {
      ...current.basis,
      refHead: head.head,
      baseDigest: describeTransitionObject(base).digest,
      initialization: { requestId: input.requestId, facts },
    };
    return {
      workspace: {
        ...workspace,
        authoringLedger: ledger,
        authoringBasis: nextBasis,
        baseCommitHash: head.head,
        authoringReconciliations: [
          ...history,
          {
            requestId: input.requestId,
            facts,
            reconciledAt,
            actor: input.actor,
            workspaceRevision: draft.revision,
            basis: workspace.authoringBasis,
            ledger: workspace.authoringLedger,
            nextRefHead: head.head,
          },
        ],
      },
      value: { kind: 'reconciled' as const },
    };
  });
}

/** Called within the PR merge transaction, after advancing its target ref. Dirty drafts remain explicit. */
export async function synchronizeCleanBranchWorkspaces(
  db: AnyDB,
  input: {
    projectId: string;
    refName: string;
    refHead: string;
    actor: DraftActionActor;
  }
) {
  const workspaces = await listWorkspaceDrafts(db, input.projectId);
  for (const draft of workspaces) {
    if (
      draft.status !== 'editing' ||
      draft.target_branch !== input.refName ||
      !draft.workspace_state?.authoringLedger
    )
      continue;
    await reconcileWorkspaceAuthoring(db, {
      projectId: input.projectId,
      workspaceId: draft.workspace_id!,
      actor: input.actor,
      requestId: `merge:${input.refHead}`,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: input.refHead,
      onlyIfClean: true,
    });
  }
}
