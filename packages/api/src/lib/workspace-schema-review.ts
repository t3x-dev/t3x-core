import {
  type WorkspaceFullSchemaReview,
  WorkspaceFullSchemaReviewSchema,
  type WorkspaceSchemaDefinitionSnapshot,
  WorkspaceSchemaDefinitionSnapshotSchema,
} from '@t3x-dev/api-client';
import { currentComposition, parseDraftActionLedger } from '@t3x-dev/application';
import {
  type AnyDB,
  DraftAuthoringConflictError,
  findYSchemaCompositionSnapshot,
  getTransitionViewForCommit,
  type ResolvedTransitionProposalGraph,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';
import { diffYSchemas, normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { resolveWorkspaceYSchema } from './workspace-yschema';

/** Older Commits may predate the local Base cache. Recover only a definition whose
 * bytes match the Schema resource in the verified Commit's validation evidence. */
export async function recoverCommittedSchema(
  db: AnyDB,
  projectId: string,
  refName: string,
  refHead: string,
  draft: WorkspaceSchemaDefinitionSnapshot
): Promise<WorkspaceSchemaDefinitionSnapshot | null> {
  const view = await getTransitionViewForCommit(db, { projectId, refName, commitId: refHead });
  if (view?.mode !== 'transition') return null;
  const resources = view.checks.validation.runs.map((run) => run.predicate.schemaResource);
  const hashes = new Set(resources.map((resource) => resource.digest));
  if (hashes.size !== 1) return null;
  for (const resource of resources) {
    if (!resource.uri.startsWith('t3x://schemas/')) continue;
    const path = resource.uri.slice('t3x://schemas/'.length);
    const separator = path.lastIndexOf('/');
    if (separator < 1) continue;
    const canonicalName = decodeURIComponent(path.slice(0, separator));
    const version = decodeURIComponent(path.slice(separator + 1));
    let definition = draft.schemaHash === resource.digest ? draft.definition : null;
    let compositionBinding: Record<string, unknown> | null = null;
    if (!definition && /^r[1-9]\d*$/.test(version)) {
      const snapshot = await findYSchemaCompositionSnapshot(db, {
        project_id: projectId,
        composition_id: canonicalName,
        composition_revision: Number(version.slice(1)),
        compiled_schema_hash: resource.digest,
      });
      if (snapshot) {
        definition = { ...normalizeYSchemaObject(snapshot.schemaJson) };
        compositionBinding = {
          compositionId: snapshot.compositionId,
          compositionRevision: snapshot.compositionRevision,
          compositionHash: snapshot.compositionHash,
          ...(Array.isArray(snapshot.manifestJson.sources)
            ? { studioSources: snapshot.manifestJson.sources }
            : {}),
        };
      }
    }
    if (!definition) {
      const resolved = await resolveWorkspaceYSchema(
        { schemaBindings: [{ canonicalName, version, schemaHash: resource.digest }] },
        db,
        projectId
      );
      if (resolved.schema) definition = { ...resolved.schema };
    }
    if (
      definition &&
      (await sha256CompositionValue(normalizeYSchemaObject(definition))) === resource.digest
    )
      return {
        status: 'bound',
        schemaHash: resource.digest,
        definition,
        bindings: [
          {
            canonicalName,
            version,
            schemaHash: resource.digest,
            recoveredFromCommit: refHead,
            ...compositionBinding,
          },
        ],
      };
  }
  return null;
}

export const unboundWorkspaceSchema = (): WorkspaceSchemaDefinitionSnapshot => ({
  status: 'unbound',
  schemaHash: null,
  definition: null,
  bindings: [],
});

export async function captureWorkspaceSchema(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>
): Promise<WorkspaceSchemaDefinitionSnapshot> {
  const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
  const resolved = await resolveWorkspaceYSchema(workspace, db, projectId);
  if (!resolved.schema) {
    if (bindings.length)
      throw new DraftAuthoringConflictError(
        'The bound Schema cannot be resolved for complete Review.'
      );
    return unboundWorkspaceSchema();
  }
  const schemaHash = await sha256CompositionValue(resolved.schema);
  if (typeof bindings[0]?.schemaHash === 'string' && bindings[0].schemaHash !== schemaHash)
    throw new DraftAuthoringConflictError('The bound Schema hash does not match its definition.');
  return {
    status: 'bound',
    schemaHash,
    definition: { ...resolved.schema },
    bindings: structuredClone(bindings),
  };
}

/** Build from the complete ledger and immutable Base contract, never an inspected action. */
export async function buildWorkspaceSchemaReview(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>
): Promise<WorkspaceFullSchemaReview> {
  const ledger = parseDraftActionLedger(workspace.authoringLedger);
  const basis = workspace.authoringBasis as { refName: string; refHead?: string | null };
  const draft = await captureWorkspaceSchema(db, projectId, workspace);
  const stored = workspace.workspaceSchemaBase as
    | { refHead?: unknown; snapshot?: unknown }
    | undefined;
  const base =
    stored?.refHead === basis?.refHead && stored?.snapshot !== undefined
      ? WorkspaceSchemaDefinitionSnapshotSchema.parse(stored.snapshot)
      : basis?.refHead === null
        ? unboundWorkspaceSchema()
        : ((basis?.refHead
            ? await recoverCommittedSchema(db, projectId, basis.refName, basis.refHead, draft)
            : null) ?? {
            status: 'unknown' as const,
            schemaHash: null,
            definition: null,
            bindings: [],
          });
  for (const definition of [base, draft]) {
    if (
      definition.status === 'bound' &&
      (!definition.definition ||
        (await sha256CompositionValue(normalizeYSchemaObject(definition.definition))) !==
          definition.schemaHash)
    )
      throw new DraftAuthoringConflictError('The frozen Schema definition has an invalid hash.');
  }
  const empty = normalizeYSchemaObject({ yschema: '0.1', name: 'Unbound', nodes: {} });
  return WorkspaceFullSchemaReviewSchema.parse({
    schema: 't3x.application/workspace-schema-review/v1',
    base,
    draft,
    changes:
      base.status === 'unknown'
        ? []
        : diffYSchemas(
            base.definition ? normalizeYSchemaObject(base.definition) : empty,
            draft.definition ? normalizeYSchemaObject(draft.definition) : empty
          ),
    actionCount: ledger.actions.length,
    baseContent: ledger.base,
    draftContent: currentComposition(ledger),
  });
}

export function frozenWorkspaceSchemaReview(
  graph: ResolvedTransitionProposalGraph
): WorkspaceFullSchemaReview | null {
  if (!graph.preparation) return null;
  const preparation = JSON.parse(graph.preparation.canonicalJson);
  return preparation.schemaReview
    ? WorkspaceFullSchemaReviewSchema.parse(preparation.schemaReview)
    : null;
}

/** Shared locked Decision/Commit check. A Studio check or an old manifest cannot authorize publication. */
export async function assertWorkspaceSchemaReview(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>,
  graph: ResolvedTransitionProposalGraph,
  requireComplete = true
) {
  if (!workspace.authoringLedger) return;
  const frozen = frozenWorkspaceSchemaReview(graph);
  // Non-schema legacy authoring callers still use their existing full-ledger preparation contract.
  if (!frozen) {
    if (Array.isArray(workspace.schemaPreparations) && workspace.schemaPreparations.length)
      throw new DraftAuthoringConflictError(
        'Schema evolution requires a complete Workspace Review, not Studio checks.'
      );
    return;
  }
  // Rejection cannot publish a result; unavailable source definitions must not erase auditability.
  // The shared authoring guard and lifecycle still check revision, Effect, bindings and ref head.
  if (!requireComplete) return;
  const current = await buildWorkspaceSchemaReview(db, projectId, workspace);
  if (
    canonicalizeProtocolValue(JSON.parse(JSON.stringify(frozen))) !==
    canonicalizeProtocolValue(JSON.parse(JSON.stringify(current)))
  )
    throw new DraftAuthoringConflictError(
      'Schema or content changed after Review. Prepare a new complete Review.'
    );
  if (frozen.base.status === 'unknown')
    throw new DraftAuthoringConflictError(
      'The Base Schema definition is unavailable. Recover its exact contract before accepting or committing.'
    );
}
