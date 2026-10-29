import {
  type WorkspaceFullSchemaReview,
  WorkspaceFullSchemaReviewSchema,
  type WorkspaceSchemaDefinitionSnapshot,
  WorkspaceSchemaDefinitionSnapshotSchema,
} from '@t3x-dev/api-client';
import { currentComposition, parseDraftActionLedger } from '@t3x-dev/application';
import { describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  DraftAuthoringConflictError,
  findTransitionCommitReceipt,
  findYSchemaCompositionSnapshot,
  getTransitionViewForCommit,
  getVerifiedTransitionCommitGraph,
  type ResolvedTransitionProposalGraph,
  resolveTransitionProposalGraph,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue, type ProposalStatement, type State } from '@t3x-dev/transition';
import { diffYSchemas, normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { isSchemaOnlyWorkspaceReview } from './workspace-schema-content';
import { resolveWorkspaceYSchema } from './workspace-yschema';

export async function workspaceSchemaReviewResource(review: WorkspaceFullSchemaReview) {
  const digest = (await sha256CompositionValue(review)) as `sha256:${string}`;
  return { uri: `t3x://workspace-schema-reviews/${digest}`, mediaType: 'application/json', digest };
}

export async function hasSchemaReviewEvidence(
  proposal: ProposalStatement,
  review: WorkspaceFullSchemaReview
) {
  const resource = await workspaceSchemaReviewResource(review);
  return (
    proposal.predicate.rationale.mode !== 'unspecified' &&
    proposal.predicate.rationale.evidence.some(
      (evidence) =>
        evidence.resource.digest === resource.digest && evidence.resource.uri === resource.uri
    )
  );
}

/** Recover only the exact Schema bound into the verified Commit's Proposal or validation evidence. */
export async function recoverCommittedSchema(
  db: AnyDB,
  projectId: string,
  refName: string,
  refHead: string,
  draft: WorkspaceSchemaDefinitionSnapshot
): Promise<WorkspaceSchemaDefinitionSnapshot | null> {
  const view = await getTransitionViewForCommit(db, { projectId, refName, commitId: refHead });
  if (view?.mode !== 'transition') return null;
  // A content-free Schema commit has a frozen definition, not instance-validation evidence.
  const receipt = await findTransitionCommitReceipt(db, projectId, refHead);
  if (receipt) {
    const graph = await resolveTransitionProposalGraph(db, projectId, receipt.transitionId);
    const frozen = graph ? frozenWorkspaceSchemaReview(graph) : null;
    if (graph && frozen && isSchemaOnlyWorkspaceReview(frozen)) {
      const committed = await getVerifiedTransitionCommitGraph(db, projectId, refHead);
      if (
        committed &&
        graph.membership.proposalDigest === describeTransitionObject(committed.proposal).digest &&
        graph.membership.effectDigest === describeTransitionObject(committed.effect).digest &&
        (await hasSchemaReviewEvidence(committed.proposal, frozen)) &&
        (await sha256CompositionValue(normalizeYSchemaObject(frozen.draft.definition))) ===
          frozen.draft.schemaHash
      )
        return frozen.draft;
      return null;
    }
  }
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
          ...(typeof snapshot.manifestJson.rootKey === 'string'
            ? { rootKey: snapshot.manifestJson.rootKey }
            : {}),
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
  const review = WorkspaceFullSchemaReviewSchema.parse({
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
  return isSchemaOnlyWorkspaceReview({ ...review, contentValidation: 'not_applicable' })
    ? { ...review, contentValidation: 'not_applicable' }
    : review;
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

/** Net content and effective Schema changes, independent of the action/operation count. */
export function workspaceSchemaReviewHasChanges(review: WorkspaceFullSchemaReview) {
  if (
    canonicalizeProtocolValue(review.baseContent) !== canonicalizeProtocolValue(review.draftContent)
  )
    return true;
  if (review.base.status === 'unknown' || review.draft.status === 'unknown') return undefined;
  return (
    review.base.status !== review.draft.status || review.base.schemaHash !== review.draft.schemaHash
  );
}

export function assertWorkspaceReviewHasChanges(
  base: State,
  result: State,
  review: WorkspaceFullSchemaReview | null
) {
  if (
    describeTransitionObject(base).digest === describeTransitionObject(result).digest &&
    (!review || workspaceSchemaReviewHasChanges(review) === false)
  )
    throw new DraftAuthoringConflictError(
      'No changes to commit. Content and Schema match the Base. Edit the Draft before preparing Review.'
    );
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
  if (requireComplete) assertWorkspaceReviewHasChanges(graph.base, graph.result, frozen);
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
