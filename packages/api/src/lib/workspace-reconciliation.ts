import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  type WorkspaceSchemaDefinitionSnapshot,
  WorkspaceSchemaDefinitionSnapshotSchema,
} from '@t3x-dev/api-client';
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
  findTransitionCommitReceipt,
  findWorkspaceDraft,
  getTransitionCommit,
  getTransitionRefHead,
  getTransitionViewForCommit,
  getVerifiedTransitionCommitGraph,
  listWorkspaceDrafts,
  NotFoundError,
  resolveTransitionProposalGraph,
  transactWorkspaceReconciliation,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';
import { normalizeYSchemaObject, sha256CompositionValue, validateTree } from '@t3x-dev/yschema';
import { schemaContentFromDocument } from './schema-evolution-impact';
import {
  buildAuthoringEffect,
  type WorkspaceAuthoringBasis,
  workspaceAuthoringState,
} from './workspace-authoring';
import { workspaceProvenance } from './workspace-provenance';
import { isSchemaOnlyWorkspaceReview, workspaceDocumentRootKey } from './workspace-schema-content';
import {
  captureWorkspaceSchema,
  frozenWorkspaceSchemaReview,
  hasSchemaReviewEvidence,
  recoverCommittedSchema,
  unboundWorkspaceSchema,
} from './workspace-schema-review';
import { schemaRootKeyFromBinding } from './yschema-registry';

export interface WorkspaceReconciliationValue {
  source: 'base' | 'workspace_draft' | 'branch' | 'resolution';
  present: boolean;
  value?: DraftDocument;
}

export interface WorkspaceReconciliationConflict {
  id: string;
  path: string;
  scope: 'content' | 'schema';
  kind: 'value' | 'type' | 'collection' | 'delete_modify' | 'schema';
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
  schemaBase: WorkspaceSchemaDefinitionSnapshot;
  schemaOurs: WorkspaceSchemaDefinitionSnapshot;
  schemaTheirs: WorkspaceSchemaDefinitionSnapshot;
  schemaMerged: WorkspaceSchemaDefinitionSnapshot;
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

function schemaIdentity(snapshot: WorkspaceSchemaDefinitionSnapshot) {
  return {
    status: snapshot.status,
    schemaHash: snapshot.schemaHash,
    rootKey: snapshot.status === 'bound' ? schemaRootKeyFromBinding(snapshot.bindings[0]) : null,
  };
}

function sameSchema(
  left: WorkspaceSchemaDefinitionSnapshot,
  right: WorkspaceSchemaDefinitionSnapshot
) {
  return isDeepStrictEqual(schemaIdentity(left), schemaIdentity(right));
}

export function reconcileWorkspaceSchemas(input: {
  base: WorkspaceSchemaDefinitionSnapshot;
  ours: WorkspaceSchemaDefinitionSnapshot;
  theirs: WorkspaceSchemaDefinitionSnapshot;
}) {
  if (sameSchema(input.ours, input.base)) return { merged: input.theirs, conflict: null };
  if (sameSchema(input.theirs, input.base) || sameSchema(input.ours, input.theirs))
    return { merged: input.ours, conflict: null };
  const values = {
    path: '/schema',
    scope: 'schema' as const,
    kind: 'schema' as const,
    base: {
      source: 'base' as const,
      present: input.base.status === 'bound',
      value: input.base as unknown as DraftDocument,
    },
    ours: {
      source: 'workspace_draft' as const,
      present: input.ours.status === 'bound',
      value: input.ours as unknown as DraftDocument,
    },
    theirs: {
      source: 'branch' as const,
      present: input.theirs.status === 'bound',
      value: input.theirs as unknown as DraftDocument,
    },
  };
  return {
    merged: input.ours,
    conflict: { id: digest(values), ...values } satisfies WorkspaceReconciliationConflict,
  };
}

async function committedSchemaAtHead(
  db: AnyDB,
  projectId: string,
  refName: string,
  refHead: string | null,
  fallback: WorkspaceSchemaDefinitionSnapshot
): Promise<WorkspaceSchemaDefinitionSnapshot> {
  if (refHead === null) return unboundWorkspaceSchema();
  const committed = await getVerifiedTransitionCommitGraph(db, projectId, refHead);
  if (!committed) throw new DraftAuthoringConflictError('The latest branch Commit is unavailable.');
  const receipt = await findTransitionCommitReceipt(db, projectId, refHead);
  const graph = receipt
    ? await resolveTransitionProposalGraph(db, projectId, receipt.transitionId)
    : null;
  if (
    graph &&
    (graph.membership.proposalDigest !== describeTransitionObject(committed.proposal).digest ||
      graph.membership.effectDigest !== describeTransitionObject(committed.effect).digest)
  )
    throw new DraftAuthoringConflictError(
      'The committed Schema preparation does not match the branch Commit.'
    );
  const view = await getTransitionViewForCommit(db, { projectId, refName, commitId: refHead });
  if (view?.mode !== 'transition')
    throw new DraftAuthoringConflictError('The latest branch Commit could not be verified.');
  const hashes = new Set(
    view.checks.validation.runs.map((run) => run.predicate.schemaResource.digest)
  );
  const hasSchemaEvidence = hashes.size > 0;
  const review = graph ? frozenWorkspaceSchemaReview(graph) : null;
  const snapshot =
    review?.draft ??
    (await recoverCommittedSchema(db, projectId, refName, refHead, fallback, view)) ??
    (hashes.size === 0 ? fallback : unboundWorkspaceSchema());
  if (snapshot.status !== 'bound') {
    if (hashes.size)
      throw new DraftAuthoringConflictError(
        'The branch Commit has Schema evidence but no recoverable Schema binding.'
      );
    return WorkspaceSchemaDefinitionSnapshotSchema.parse(snapshot);
  }
  const schema = snapshot.definition ? normalizeYSchemaObject(snapshot.definition) : null;
  const schemaOnlyEvidence =
    review &&
    isSchemaOnlyWorkspaceReview(review) &&
    (await hasSchemaReviewEvidence(committed.proposal, review));
  if (
    !schema ||
    (await sha256CompositionValue(schema)) !== snapshot.schemaHash ||
    (hasSchemaEvidence &&
      !schemaOnlyEvidence &&
      (hashes.size !== 1 || !hashes.has(snapshot.schemaHash as `sha256:${string}`)))
  )
    throw new DraftAuthoringConflictError(
      'The exact Schema bound to the branch Commit failed verification.'
    );
  return WorkspaceSchemaDefinitionSnapshotSchema.parse(snapshot);
}

async function workspaceSchemaBase(
  db: AnyDB,
  projectId: string,
  refName: string,
  refHead: string | null,
  workspace: Record<string, unknown>,
  fallback: WorkspaceSchemaDefinitionSnapshot
) {
  const stored = workspace.workspaceSchemaBase as
    | { refHead?: unknown; snapshot?: unknown }
    | undefined;
  if (stored?.refHead === refHead && stored.snapshot !== undefined)
    return WorkspaceSchemaDefinitionSnapshotSchema.parse(stored.snapshot);
  return committedSchemaAtHead(db, projectId, refName, refHead, fallback);
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
): { document: DraftDocument; schema: WorkspaceSchemaDefinitionSnapshot } {
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
  let document = preparation.merged;
  let schema = preparation.schemaMerged;
  for (const conflict of preparation.conflicts) {
    const resolution = byId.get(conflict.id)!;
    const selected =
      resolution.choice === 'custom'
        ? { source: 'resolution' as const, present: true, value: resolution.value }
        : conflict[resolution.choice];
    if (conflict.scope === 'schema') {
      schema = WorkspaceSchemaDefinitionSnapshotSchema.parse(selected.value);
    } else {
      document = replacePointer(document, conflict.path, selected);
    }
  }
  return { document, schema };
}

async function validateResolvedDocument(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>,
  document: DraftDocument,
  snapshot: WorkspaceSchemaDefinitionSnapshot
) {
  if (snapshot.status === 'unbound') return;
  const bindings = snapshot.bindings;
  if (snapshot.status !== 'bound' || bindings.length !== 1 || !snapshot.definition)
    throw new WorkspaceReconciliationValidationError([
      {
        code: 'BOUND_SCHEMA_UNAVAILABLE',
        path: '$',
        message: 'An exact bound Workspace Schema is required before conflicts can be resolved.',
      },
    ]);
  const binding = bindings[0];
  const explicitRootKey =
    binding && typeof binding === 'object' && !Array.isArray(binding)
      ? (binding as Record<string, unknown>).rootKey
      : undefined;
  const rootKey =
    typeof explicitRootKey === 'string' && /^[a-z][a-z0-9_]*$/.test(explicitRootKey)
      ? schemaRootKeyFromBinding(binding)
      : (workspaceDocumentRootKey(document) ?? schemaRootKeyFromBinding(binding));
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
    schema: normalizeYSchemaObject(snapshot.definition),
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
  schemaBase: WorkspaceSchemaDefinitionSnapshot;
  schemaOurs: WorkspaceSchemaDefinitionSnapshot;
  schemaTheirs: WorkspaceSchemaDefinitionSnapshot;
}): WorkspaceReconciliationPreparation {
  const result = reconcileDocuments(input.base, input.ours, input.theirs);
  const contentConflicts = result.conflicts.map((path) => {
    const values = {
      path,
      scope: 'content' as const,
      base: pointerValue(input.base, path, 'base'),
      ours: pointerValue(input.ours, path, 'workspace_draft'),
      theirs: pointerValue(input.theirs, path, 'branch'),
    };
    const kind = conflictKind(values.base, values.ours, values.theirs);
    return { id: digest({ ...values, kind }), kind, ...values };
  });
  const schema = reconcileWorkspaceSchemas({
    base: input.schemaBase,
    ours: input.schemaOurs,
    theirs: input.schemaTheirs,
  });
  const conflicts = schema.conflict ? [...contentConflicts, schema.conflict] : contentConflicts;
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
    schemaBase: input.schemaBase,
    schemaOurs: input.schemaOurs,
    schemaTheirs: input.schemaTheirs,
    schemaMerged: schema.merged,
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
  const schemaOurs = await captureWorkspaceSchema(db, input.projectId, draft.workspace_state);
  const [schemaBase, schemaTheirs] = await Promise.all([
    workspaceSchemaBase(
      db,
      input.projectId,
      current.basis.refName,
      current.basis.refHead,
      draft.workspace_state,
      schemaOurs
    ),
    committedSchemaAtHead(db, input.projectId, current.basis.refName, head.head, schemaOurs),
  ]);
  return preparationFromDocuments({
    workspaceRevision: draft.revision,
    refName: current.basis.refName,
    baseHead: current.basis.refHead,
    currentRefHead: head.head,
    base: current.ledger.base,
    ours: currentComposition(current.ledger),
    theirs,
    schemaBase,
    schemaOurs,
    schemaTheirs,
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

    const resolved =
      input.action === 'resolve'
        ? resolvePreparation(preparation, input.resolutions ?? [])
        : { document: preparation.merged, schema: preparation.schemaMerged };
    if (input.action === 'adopt' || input.action === 'resolve')
      await validateResolvedDocument(
        tx,
        input.projectId,
        workspace,
        resolved.document,
        resolved.schema
      );

    const decidedAt = new Date().toISOString();
    const audit = {
      requestId: input.requestId,
      facts,
      reconciledAt: decidedAt,
      actor: input.actor,
      workspaceRevision: draft.revision,
      basis: workspace.authoringBasis,
      ledger: workspace.authoringLedger,
      schemaBindings: workspace.schemaBindings,
      workspaceSchemaBase: workspace.workspaceSchemaBase,
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

    const nextDocument = input.action === 'discard' ? preparation.theirs : resolved.document;
    const nextSchema = input.action === 'discard' ? preparation.schemaTheirs : resolved.schema;
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
        schemaBindings: structuredClone(nextSchema.bindings),
        workspaceSchemaBase: {
          refHead: preparation.currentRefHead,
          snapshot: structuredClone(preparation.schemaTheirs),
        },
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
    const local = currentComposition(current.ledger);
    if (
      input.onlyIfClean &&
      (!isDeepStrictEqual(local, current.ledger.base) ||
        workspace.schemaEditCandidate ||
        workspace.schemaPending)
    )
      return { workspace: null, value: { kind: 'pending' as const } };
    const preparation = await prepareFromDraft(tx, draft, input);
    if (preparation.baseHead === preparation.currentRefHead)
      return { workspace: null, value: { kind: 'no_change' as const } };
    if (preparation.conflicts.length)
      throw new DraftAuthoringConflictError(
        `Cannot sync overlapping changes at ${preparation.conflicts.map((conflict) => conflict.path).join(', ')}. Your Workspace edits are unchanged.`
      );
    await validateResolvedDocument(
      tx,
      input.projectId,
      workspace,
      preparation.merged,
      preparation.schemaMerged
    );
    const reconciledAt = new Date().toISOString();
    let ledger = createDraftActionLedger(preparation.theirs);
    if (!isDeepStrictEqual(preparation.merged, preparation.theirs)) {
      const imported = importLegacyDocument({
        base: ledger.base,
        current: preparation.merged,
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
    if (!isDeepStrictEqual(buildAuthoringEffect(ledger).result.value, preparation.merged))
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
        schemaBindings: structuredClone(preparation.schemaMerged.bindings),
        workspaceSchemaBase: {
          refHead: preparation.currentRefHead,
          snapshot: structuredClone(preparation.schemaTheirs),
        },
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
            schemaBindings: workspace.schemaBindings,
            workspaceSchemaBase: workspace.workspaceSchemaBase,
            nextRefHead: preparation.currentRefHead,
          },
        ],
      },
      value: { kind: 'reconciled' as const },
    };
  });
}

async function synchronizeUninitializedWorkspace(
  db: AnyDB,
  input: {
    projectId: string;
    workspaceId: string;
    requestId: string;
    actor: DraftActionActor;
    refName: string;
    refHead: string;
    expectedWorkspaceRevision: number;
  }
) {
  const facts = canonicalizeProtocolValue(JSON.parse(JSON.stringify(input)));
  return transactWorkspaceReconciliation<{ kind: 'pending' | 'reconciled' }>(
    db,
    input,
    async (tx, draft) => {
      const workspace = draft.workspace_state;
      if (!workspace) throw new NotFoundError(input.workspaceId);
      if (draft.revision !== input.expectedWorkspaceRevision)
        throw new ConflictError(draft.id, input.expectedWorkspaceRevision);
      if (draft.target_branch !== input.refName)
        throw new DraftAuthoringConflictError('Target ref changed');
      const operations = (workspace.yopsDraft as { operations?: unknown[] } | undefined)
        ?.operations;
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
      const schema = await committedSchemaAtHead(
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
      const reconciledAt = new Date().toISOString();
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
              reconciledAt,
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
        value: { kind: 'reconciled' as const },
      };
    }
  );
}

/** Called inside each Commit transaction after advancing its target ref. Dirty Drafts remain explicit. */
export async function synchronizeCleanBranchWorkspaces(
  db: AnyDB,
  input: {
    projectId: string;
    refName: string;
    refHead: string;
    actor: DraftActionActor;
    excludeWorkspaceId?: string;
  }
) {
  const workspaces = await listWorkspaceDrafts(db, input.projectId);
  for (const draft of workspaces) {
    if (
      draft.workspace_id === input.excludeWorkspaceId ||
      draft.status !== 'editing' ||
      draft.target_branch !== input.refName ||
      !draft.workspace_state
    )
      continue;
    if (!draft.workspace_state.authoringLedger) {
      await synchronizeUninitializedWorkspace(db, {
        projectId: input.projectId,
        refName: input.refName,
        refHead: input.refHead,
        actor: input.actor,
        workspaceId: draft.workspace_id!,
        requestId: `ref-sync:${input.refHead}`,
        expectedWorkspaceRevision: draft.revision,
      });
      continue;
    }
    await reconcileWorkspaceAuthoring(db, {
      projectId: input.projectId,
      workspaceId: draft.workspace_id!,
      actor: input.actor,
      requestId: `ref-sync:${input.refHead}`,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: input.refHead,
      onlyIfClean: true,
    });
  }
}
