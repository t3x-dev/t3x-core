import { createHash } from 'node:crypto';
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
  getTransitionCommit,
  getTransitionRefHead,
  listWorkspaceDrafts,
  NotFoundError,
  transactWorkspaceReconciliation,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';
import { validateTree } from '@t3x-dev/yschema';
import { schemaContentFromDocument } from './schema-evolution-impact';
import {
  buildAuthoringEffect,
  type WorkspaceAuthoringBasis,
  workspaceAuthoringState,
} from './workspace-authoring';
import { workspaceProvenance } from './workspace-provenance';
import { resolveWorkspaceYSchema } from './workspace-yschema';
import { schemaRootKeyFromBinding } from './yschema-registry';

export interface WorkspaceReconciliationValue {
  source: 'base' | 'workspace_draft' | 'branch' | 'resolution';
  present: boolean;
  value?: DraftDocument;
}

export interface WorkspaceReconciliationConflict {
  id: string;
  path: string;
  kind: 'value' | 'type' | 'collection' | 'delete_modify';
  base: WorkspaceReconciliationValue;
  ours: WorkspaceReconciliationValue;
  theirs: WorkspaceReconciliationValue;
}

export interface WorkspaceReconciliationPreparation {
  schema: 't3x.application/workspace-reconciliation-preparation/v1';
  preparationDigest: string;
  workspaceRevision: number;
  refName: string;
  baseHead: string | null;
  currentRefHead: string | null;
  base: DraftDocument;
  ours: DraftDocument;
  theirs: DraftDocument;
  merged: DraftDocument;
  conflicts: WorkspaceReconciliationConflict[];
}

export type WorkspaceReconciliationResolution =
  | { conflictId: string; choice: 'base' | 'ours' | 'theirs' }
  | { conflictId: string; choice: 'custom'; value: DraftDocument };

export interface WorkspaceReconciliationValidationIssue {
  code: string;
  path: string;
  message: string;
}

export class WorkspaceReconciliationConflictError extends Error {
  readonly code = 'WORKSPACE_RECONCILIATION_CONFLICT';

  constructor(readonly preparation: WorkspaceReconciliationPreparation) {
    super('Workspace has overlapping changes. Resolve the listed conflicts or discard the Draft.');
    this.name = 'WorkspaceReconciliationConflictError';
  }
}

export class WorkspaceReconciliationValidationError extends Error {
  readonly code = 'WORKSPACE_RECONCILIATION_VALIDATION_FAILED';

  constructor(readonly issues: WorkspaceReconciliationValidationIssue[]) {
    super('Resolved Workspace content does not pass its complete bound Schema validation.');
    this.name = 'WorkspaceReconciliationValidationError';
  }
}

function digest(value: unknown): string {
  const canonical = canonicalizeProtocolValue(JSON.parse(JSON.stringify(value)));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function pointerValue(
  document: DraftDocument,
  pointer: string,
  source: WorkspaceReconciliationValue['source']
): WorkspaceReconciliationValue {
  if (pointer === '/') return { source, present: true, value: document };
  let current: DraftDocument | undefined = document;
  for (const segment of pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.hasOwn(current, segment)
    )
      return { source, present: false };
    current = (current as Record<string, DraftDocument>)[segment];
  }
  return current === undefined
    ? { source, present: false }
    : { source, present: true, value: current };
}

function conflictKind(
  base: WorkspaceReconciliationValue,
  ours: WorkspaceReconciliationValue,
  theirs: WorkspaceReconciliationValue
): WorkspaceReconciliationConflict['kind'] {
  if (!base.present || !ours.present || !theirs.present) return 'delete_modify';
  if ([base.value, ours.value, theirs.value].some(Array.isArray)) return 'collection';
  const type = (value: DraftDocument) => (value === null ? 'null' : typeof value);
  if (new Set([type(base.value!), type(ours.value!), type(theirs.value!)]).size > 1) return 'type';
  return 'value';
}

function pointerSegments(pointer: string): string[] {
  if (pointer === '/') return [];
  if (!pointer.startsWith('/')) throw new TypeError(`Invalid conflict path: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function replacePointer(
  document: DraftDocument,
  pointer: string,
  selected: WorkspaceReconciliationValue
): DraftDocument {
  type Value = DraftDocument | undefined;
  const segments = pointerSegments(pointer);
  const clone = (value: DraftDocument) => JSON.parse(JSON.stringify(value)) as DraftDocument;
  const visit = (current: Value, index: number): Value => {
    if (index === segments.length) return selected.present ? clone(selected.value!) : undefined;
    if (current === null || typeof current !== 'object' || Array.isArray(current))
      throw new TypeError(`Conflict path ${pointer} is no longer a mapping path`);
    const entries = new Map(Object.entries(current));
    const key = segments[index]!;
    const next = visit(entries.get(key), index + 1);
    if (next === undefined) entries.delete(key);
    else entries.set(key, next);
    return Object.fromEntries(
      [...entries.entries()].sort(([left], [right]) => left.localeCompare(right))
    );
  };
  return visit(document, 0) ?? {};
}

function resolvePreparation(
  preparation: WorkspaceReconciliationPreparation,
  resolutions: WorkspaceReconciliationResolution[]
): DraftDocument {
  const byId = new Map<string, WorkspaceReconciliationResolution>();
  for (const resolution of resolutions) {
    if (byId.has(resolution.conflictId))
      throw new DraftAuthoringConflictError(
        `Conflict ${resolution.conflictId} has more than one resolution`
      );
    byId.set(resolution.conflictId, resolution);
  }
  const expected = new Set(preparation.conflicts.map((conflict) => conflict.id));
  const unknown = [...byId.keys()].filter((id) => !expected.has(id));
  if (unknown.length)
    throw new DraftAuthoringConflictError(
      `Unknown reconciliation conflicts: ${unknown.join(', ')}`
    );
  const missing = preparation.conflicts.filter((conflict) => !byId.has(conflict.id));
  if (missing.length)
    throw new DraftAuthoringConflictError(
      `Every conflict requires a resolution: ${missing.map((conflict) => conflict.path).join(', ')}`
    );
  let resolved = preparation.merged;
  for (const conflict of preparation.conflicts) {
    const resolution = byId.get(conflict.id)!;
    const selected =
      resolution.choice === 'custom'
        ? { source: 'resolution' as const, present: true, value: resolution.value }
        : conflict[resolution.choice];
    resolved = replacePointer(resolved, conflict.path, selected);
  }
  return resolved;
}

async function validateResolvedDocument(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>,
  document: DraftDocument
) {
  const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
  const resolution = await resolveWorkspaceYSchema(workspace, db, projectId);
  if (bindings.length !== 1 || !resolution.schema)
    throw new WorkspaceReconciliationValidationError([
      {
        code: 'BOUND_SCHEMA_UNAVAILABLE',
        path: '$',
        message: 'An exact bound Workspace Schema is required before conflicts can be resolved.',
      },
    ]);
  const rootKey = schemaRootKeyFromBinding(bindings[0]);
  let content: ReturnType<typeof schemaContentFromDocument>;
  try {
    content = schemaContentFromDocument(document as Record<string, unknown>, rootKey);
  } catch (error) {
    throw new WorkspaceReconciliationValidationError([
      {
        code: 'BOUND_ROOT_INVALID',
        path: rootKey,
        message: error instanceof Error ? error.message : 'The bound Draft root is invalid.',
      },
    ]);
  }
  const report = validateTree({
    schema: resolution.schema,
    tree: content.tree as never,
    relations: content.relations,
    provenanceByPath: await workspaceProvenance(
      db,
      projectId,
      workspace,
      content.tree as DraftDocument
    ),
  });
  if (!report.valid || !report.ready)
    throw new WorkspaceReconciliationValidationError(
      [...report.errors, ...report.gaps].map(({ code, path, message }) => ({
        code,
        path: String(path),
        message,
      }))
    );
}

async function assertAncestor(
  db: AnyDB,
  projectId: string,
  ancestor: string | null,
  descendant: string | null
) {
  if (ancestor === null || ancestor === descendant) return;
  if (descendant === null)
    throw new DraftAuthoringConflictError('Target branch no longer descends from the Draft Base');
  const visited = new Set<string>();
  const queue = [descendant];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === ancestor) return;
    if (visited.has(current)) continue;
    visited.add(current);
    const commit = await getTransitionCommit(db, projectId, current);
    if (!commit) break;
    queue.push(...commit.commit.parents.map((parent) => parent.digest));
  }
  throw new DraftAuthoringConflictError(
    'Target branch diverged from the Draft Base; automatic synchronization is not allowed'
  );
}

function preparationFromDocuments(input: {
  workspaceRevision: number;
  refName: string;
  baseHead: string | null;
  currentRefHead: string | null;
  base: DraftDocument;
  ours: DraftDocument;
  theirs: DraftDocument;
}): WorkspaceReconciliationPreparation {
  const result = reconcileDocuments(input.base, input.ours, input.theirs);
  const conflicts = result.conflicts.map((path) => {
    const values = {
      path,
      base: pointerValue(input.base, path, 'base'),
      ours: pointerValue(input.ours, path, 'workspace_draft'),
      theirs: pointerValue(input.theirs, path, 'branch'),
    };
    const kind = conflictKind(values.base, values.ours, values.theirs);
    return { id: digest({ ...values, kind }), kind, ...values };
  });
  const payload = {
    schema: 't3x.application/workspace-reconciliation-preparation/v1' as const,
    workspaceRevision: input.workspaceRevision,
    refName: input.refName,
    baseHead: input.baseHead,
    currentRefHead: input.currentRefHead,
    base: input.base,
    ours: input.ours,
    theirs: input.theirs,
    merged: result.current,
    conflicts,
  };
  return { ...payload, preparationDigest: digest(payload) };
}

async function prepareFromDraft(
  db: AnyDB,
  draft: NonNullable<Awaited<ReturnType<typeof findWorkspaceDraft>>>,
  input: { projectId: string; expectedWorkspaceRevision: number; expectedRefHead: string | null }
) {
  if (!draft.workspace_state) throw new NotFoundError(draft.workspace_id ?? draft.id);
  if (draft.revision !== input.expectedWorkspaceRevision)
    throw new ConflictError(draft.id, input.expectedWorkspaceRevision);
  const current = workspaceAuthoringState(draft.workspace_state);
  if (draft.target_branch !== current.basis.refName)
    throw new DraftAuthoringConflictError('Target ref changed');
  const head = await getTransitionRefHead(db, {
    projectId: input.projectId,
    refName: current.basis.refName,
  });
  if (head.head !== input.expectedRefHead)
    throw new DraftAuthoringConflictError('Branch changed again; refresh before preparing sync');
  await assertAncestor(db, input.projectId, current.basis.refHead, head.head);
  const theirs =
    head.format === 'empty' ? createYOpsState({}).value : (head.state.value as DraftDocument);
  return preparationFromDocuments({
    workspaceRevision: draft.revision,
    refName: current.basis.refName,
    baseHead: current.basis.refHead,
    currentRefHead: head.head,
    base: current.ledger.base,
    ours: currentComposition(current.ledger),
    theirs,
  });
}

export async function prepareWorkspaceReconciliation(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    expectedWorkspaceRevision: number;
    expectedRefHead: string | null;
  }
) {
  const draft = await findWorkspaceDraft(db, input.projectId, input.workspaceId);
  if (!draft?.workspace_state) throw new NotFoundError(input.workspaceId);
  return prepareFromDraft(db, draft, input);
}

export async function decideWorkspaceReconciliation(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    requestId: string;
    actor: DraftActionActor;
    expectedWorkspaceRevision: number;
    expectedRefHead: string | null;
    preparationDigest: string;
    action: 'adopt' | 'cancel' | 'discard' | 'resolve';
    resolutions?: WorkspaceReconciliationResolution[];
  }
) {
  const initial = await findWorkspaceDraft(db, input.projectId, input.workspaceId);
  if (!initial?.workspace_state) throw new NotFoundError(input.workspaceId);
  const initialState = workspaceAuthoringState(initial.workspace_state);
  const facts = canonicalizeProtocolValue(JSON.parse(JSON.stringify(input)));
  return transactWorkspaceReconciliation<{
    kind: 'reused' | 'no_change' | 'reconciled' | 'resolved' | 'cancelled' | 'discarded';
    preparationDigest: string;
  }>(db, { ...input, refName: initialState.basis.refName }, async (tx, draft) => {
    const workspace = draft.workspace_state!;
    const current = workspaceAuthoringState(workspace);
    const history = (workspace.authoringReconciliations ?? []) as Array<Record<string, unknown>>;
    const receipt = history.find((entry) => entry.requestId === input.requestId);
    if (receipt) {
      if (receipt.facts !== facts)
        throw new DraftAuthoringConflictError(
          'Reconciliation decision request was reused with different facts'
        );
      return {
        workspace: null,
        value: { kind: 'reused' as const, preparationDigest: input.preparationDigest },
      };
    }
    const preparation = await prepareFromDraft(tx, draft, input);
    if (preparation.preparationDigest !== input.preparationDigest)
      throw new DraftAuthoringConflictError(
        'Reconciliation preparation changed; prepare a new preview before deciding'
      );
    if (preparation.baseHead === preparation.currentRefHead)
      return {
        workspace: null,
        value: { kind: 'no_change' as const, preparationDigest: input.preparationDigest },
      };
    if (input.action === 'adopt' && preparation.conflicts.length > 0)
      throw new WorkspaceReconciliationConflictError(preparation);
    if (input.action === 'resolve' && preparation.conflicts.length === 0)
      throw new DraftAuthoringConflictError(
        'This preparation has no conflicts; adopt it without conflict resolutions'
      );

    const resolvedDocument =
      input.action === 'resolve'
        ? resolvePreparation(preparation, input.resolutions ?? [])
        : preparation.merged;
    if (input.action === 'resolve')
      await validateResolvedDocument(tx, input.projectId, workspace, resolvedDocument);

    const decidedAt = new Date().toISOString();
    const audit = {
      requestId: input.requestId,
      facts,
      reconciledAt: decidedAt,
      actor: input.actor,
      workspaceRevision: draft.revision,
      basis: workspace.authoringBasis,
      ledger: workspace.authoringLedger,
      nextRefHead: preparation.currentRefHead,
      preparationDigest: preparation.preparationDigest,
      outcome: input.action,
      conflictIds: preparation.conflicts.map((conflict) => conflict.id),
      ...(input.action === 'resolve'
        ? { resolutions: structuredClone(input.resolutions ?? []) }
        : {}),
    };
    if (input.action === 'cancel') {
      return {
        workspace: {
          ...workspace,
          authoringReconciliations: [...history, audit],
        },
        value: { kind: 'cancelled' as const, preparationDigest: input.preparationDigest },
      };
    }

    const nextDocument = input.action === 'discard' ? preparation.theirs : resolvedDocument;
    let ledger = createDraftActionLedger(preparation.theirs);
    if (!isDeepStrictEqual(nextDocument, preparation.theirs)) {
      const imported = importLegacyDocument({
        base: ledger.base,
        current: nextDocument,
        actionId: `reconcile:${input.requestId}`,
        actor: input.actor,
        publishedAt: decidedAt,
        reason:
          'Carry forward Workspace edits after explicit branch synchronization; original actions remain in the reconciliation archive',
      });
      if (imported.kind !== 'published' && imported.kind !== 'no_change')
        throw new DraftAuthoringConflictError('Workspace edits could not be carried forward');
      ledger = imported.ledger;
    }
    if (!isDeepStrictEqual(buildAuthoringEffect(ledger).result.value, nextDocument))
      throw new TypeError('Reconciled authoring replay mismatch');
    const nextBasis: WorkspaceAuthoringBasis = {
      ...current.basis,
      refHead: preparation.currentRefHead,
      baseDigest: describeTransitionObject(createYOpsState(preparation.theirs)).digest,
      initialization: { requestId: input.requestId, facts },
    };
    return {
      workspace: {
        ...workspace,
        authoringLedger: ledger,
        authoringBasis: nextBasis,
        baseCommitHash: preparation.currentRefHead,
        authoringReconciliations: [...history, audit],
      },
      value: {
        kind:
          input.action === 'discard'
            ? ('discarded' as const)
            : input.action === 'resolve'
              ? ('resolved' as const)
              : ('reconciled' as const),
        preparationDigest: input.preparationDigest,
      },
    };
  });
}

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
