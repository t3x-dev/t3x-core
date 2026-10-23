import {
  type SchemaPreparationApplyInput,
  type SchemaPreparationInput,
  SchemaPreparationPreviewSchema,
  type WorkspaceSchemaPending,
  WorkspaceSchemaPendingSchema,
} from '@t3x-dev/api-client';
import {
  compileSchemaContentMigration,
  currentComposition,
  type DraftActionActor,
  publishDraftAction,
  resolveWorkspaceSchemaBindingMode,
} from '@t3x-dev/application';
import {
  canonicalNativeYValue,
  createYOpsState,
  describeTransitionObject,
  type NativeYValue,
  resolveNativeYOpsPath,
} from '@t3x-dev/core';
import {
  type AnyDB,
  findWorkspaceDraft,
  getTransitionRefHead,
  saveYSchemaCompositionSnapshot,
  transactWorkspaceAuthoring,
} from '@t3x-dev/storage';
import {
  compileYSchemaComposition,
  compileYSchemaCompositionV2,
  normalizeYSchemaObject,
  sha256CompositionValue,
  validateTree,
  type YSchemaCompositionDraft,
  type YSchemaCompositionDraftV2,
} from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { assertProjectAccess } from './project-access';
import { assessWorkspaceSchemaImpact, schemaContentFromDocument } from './schema-evolution-impact';
import { resolveStudioSource } from './schema-studio';
import { previewStudio, StudioError } from './schema-studio-preview';
import { buildAuthoringEffect, workspaceAuthoringState } from './workspace-authoring';
import { workspaceProvenance } from './workspace-provenance';
import {
  resolveCompositionArtifacts,
  resolveCompositionArtifactsV2,
} from './yschema-artifact-registry';
import { schemaRootKeyFromBinding } from './yschema-registry';

type Source = WorkspaceSchemaPending['source'];

async function resolveSource(
  c: Context,
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  workspace: Record<string, unknown>,
  source: Source
) {
  if (source.kind === 'studio') {
    const preview = await previewStudio(c, db, projectId, {
      workspaceId,
      candidateIds: source.candidateIds,
      schemaEditCandidate: source.schemaEditCandidate,
    });
    if (!preview.adoption.allowed)
      throw new StudioError('FORBIDDEN', 'Source adoption is no longer authorized.');
    if (!preview.report.valid || !preview.impact || preview.impact.status === 'blocked')
      throw new StudioError(
        'REVIEW_REQUIRED',
        'Resolve the definition and Workspace checks before preparing content.'
      );
    const schema = normalizeYSchemaObject(preview.schema);
    const reference = preview.sources.length === 1 ? preview.sources[0] : undefined;
    const release = reference
      ? await resolveStudioSource(c, db, {
          sourceProjectId: reference.projectId,
          canonicalName: reference.canonicalName,
          version: reference.version,
          artifactHash: reference.hash,
        })
      : null;
    const unchangedRelease =
      release?.kind === 'schema' &&
      (await sha256CompositionValue(normalizeYSchemaObject(release.manifest.schema))) ===
        preview.schemaHash;
    return {
      ...preview,
      schema,
      impact: preview.impact,
      bindingMode: resolveWorkspaceSchemaBindingMode({
        source: unchangedRelease ? 'published_schema' : 'workspace_schema',
      }),
      publishedReference:
        unchangedRelease && release
          ? {
              canonicalName: release.canonicalName,
              version: release.version,
              schemaName: release.displayName || schema.name,
            }
          : null,
    };
  }
  const composition = workspace.schemaComposition as
    | YSchemaCompositionDraft
    | YSchemaCompositionDraftV2
    | undefined;
  if (
    !composition ||
    composition.id !== source.compositionId ||
    composition.revision !== source.revision
  )
    throw new StudioError('CONFLICT', 'The saved Composition changed. Review it again.');
  const preview =
    composition.apiVersion === 't3x.dev/yschema-composition/v2'
      ? await compileYSchemaCompositionV2({
          composition,
          modules: await resolveCompositionArtifactsV2(db, composition, projectId, c),
        })
      : await compileYSchemaComposition({
          composition,
          ...(await resolveCompositionArtifacts(db, composition, projectId, c)),
        });
  if (!preview.report.valid || preview.compositionHash !== source.compositionHash)
    throw new StudioError('CONFLICT', 'The Composition sources or definition changed.');
  const impact = await assessWorkspaceSchemaImpact(db, projectId, workspace, preview.schema);
  if (impact.status === 'blocked')
    throw new StudioError('REVIEW_REQUIRED', 'Current content is unavailable.');
  return {
    schema: preview.schema,
    schemaHash: preview.compiledSchemaHash,
    selectionHash: preview.compositionHash,
    reviewHash: '',
    renderPlan: preview.renderPlan,
    origins: preview.originsByPath,
    impact,
    bindingMode: resolveWorkspaceSchemaBindingMode({ source: 'composition' }),
    publishedReference: null,
  };
}

/** Complete server-side content, never an inspected action or a browser sample. Read-only. */
export async function previewWorkspaceSchemaPreparation(
  c: Context,
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  input: SchemaPreparationInput,
  options: { allowInputGaps?: boolean } = {}
) {
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state) throw new StudioError('NOT_FOUND', 'Workspace is unavailable.');
  if (draft.revision !== input.ifRevision)
    throw new StudioError('CONFLICT', 'Workspace changed. Preview the migration again.');
  const workspace = draft.workspace_state;
  if (!workspace.authoringLedger)
    throw new StudioError(
      'CONFLICT',
      'Initialize Draft editing in the Workspace before preparing a Schema migration. Existing edits require explicit import.'
    );
  const { ledger, basis } = workspaceAuthoringState(workspace);
  const head = await getTransitionRefHead(db, { projectId, refName: basis.refName });
  if (head.head !== basis.refHead || draft.target_branch !== basis.refName)
    throw new StudioError(
      'CONFLICT',
      'The branch head changed. Reconcile the Draft before migration.'
    );
  const pending =
    input.target.kind === 'pending'
      ? WorkspaceSchemaPendingSchema.safeParse(workspace.schemaPending)
      : null;
  if (
    input.target.kind === 'pending' &&
    (!pending?.success ||
      pending.data.pendingId !== input.target.pendingId ||
      pending.data.workspaceRevision !== draft.revision)
  )
    throw new StudioError('CONFLICT', 'The Pending candidate changed. Review and adopt it again.');
  const studioTarget = input.target as Extract<
    SchemaPreparationInput['target'],
    { kind: 'studio' }
  >;
  const source: Source = pending?.success
    ? pending.data.source
    : {
        kind: 'studio',
        candidateIds: studioTarget.candidateIds,
        ...(studioTarget.schemaEditCandidate
          ? { schemaEditCandidate: studioTarget.schemaEditCandidate }
          : {}),
      };
  const target = await resolveSource(c, db, projectId, workspaceId, workspace, source);
  if (input.target.kind === 'studio' && target.reviewHash !== input.target.reviewHash)
    throw new StudioError('CONFLICT', 'The Studio preview changed. Review the candidate again.');
  if (
    pending?.success &&
    (pending.data.schemaHash !== target.schemaHash ||
      pending.data.selectionHash !== target.selectionHash ||
      pending.data.contentHash !== target.impact.content.hash ||
      pending.data.bindingHash !== (await sha256CompositionValue(workspace.schemaBindings ?? [])))
  )
    throw new StudioError(
      'CONFLICT',
      'The pending preview is stale. Review and adopt the candidate again.'
    );
  const rootKey = schemaRootKeyFromBinding(
    Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings[0] : undefined
  );
  const before = currentComposition(ledger);
  const migration = compileSchemaContentMigration(before, rootKey, input.commands);
  const afterContent = schemaContentFromDocument(
    migration.document as Record<string, unknown>,
    rootKey
  );
  const beforeContent = schemaContentFromDocument(before as Record<string, unknown>, rootKey);
  const report = validateTree({
    schema: target.schema,
    tree: afterContent.tree as never,
    relations: afterContent.relations,
    provenanceByPath: await workspaceProvenance(
      db,
      projectId,
      workspace,
      afterContent.tree as never
    ),
  });
  const issues: Array<{ code: string; path: string; message: string }> = [
    ...report.errors,
    ...report.gaps,
  ].map(({ code, path, message }) => ({ code, path, message }));
  for (const item of target.impact.items.filter((item) => item.kind === 'needs_mapping')) {
    if (!input.confirmedChanges.includes(item.path))
      issues.push({
        code: 'MAPPING_CONFIRMATION_REQUIRED',
        path: item.path,
        message: 'Confirm how these commands handle this definition change.',
      });
    const unchanged = item.affectedPaths.filter((path) => {
      // Impact paths are logical content paths, not executable native document paths.
      const nativePath = path
        .split('/')
        .map((part) => JSON.stringify(part))
        .join('/');
      const old = resolveNativeYOpsPath(beforeContent.tree as NativeYValue, nativePath);
      const next = resolveNativeYOpsPath(afterContent.tree as NativeYValue, nativePath);
      return (
        old !== undefined &&
        next !== undefined &&
        canonicalNativeYValue(old) === canonicalNativeYValue(next)
      );
    });
    if (unchanged.length)
      issues.push({
        code: 'CONTENT_MAPPING_REQUIRED',
        path: item.path,
        message: `Provide a concrete migration for affected content: ${unchanged.join(', ')}`,
      });
  }
  const previewHash = await sha256CompositionValue({
    projectId,
    workspaceId,
    input,
    source,
    schemaHash: target.schemaHash,
    selectionHash: target.selectionHash,
    workspaceRevision: draft.revision,
    compositionRevision: ledger.compositionRevision,
    refHead: basis.refHead,
    bindings: workspace.schemaBindings ?? [],
    before,
    after: migration.document,
    operations: migration.operations,
  });
  const view = SchemaPreparationPreviewSchema.parse({
    previewHash,
    workspaceRevision: draft.revision,
    compositionRevision: ledger.compositionRevision,
    refHead: basis.refHead,
    schemaHash: target.schemaHash,
    schema: target.schema,
    rootKey,
    before,
    after: migration.document,
    operations: migration.operations,
    impact: target.impact,
    valid: report.valid,
    ready: report.ready,
    canPrepare:
      report.valid &&
      (report.ready || options.allowInputGaps === true) &&
      issues.every(
        (issue) =>
          options.allowInputGaps === true &&
          report.gaps.some((gap) => gap.code === issue.code && gap.path === issue.path)
      ),
    issues,
  });
  return { view, target, source, draft, migration };
}

/** Shared deterministic Draft action for Studio preparation and assistant rename confirmation. */
export function publishSchemaPreparationContent(
  workspace: Record<string, unknown>,
  workspaceRevision: number,
  migration: ReturnType<typeof compileSchemaContentMigration>,
  actor: DraftActionActor,
  actionId: string,
  reason: string
) {
  const current = workspaceAuthoringState(workspace);
  const published = publishDraftAction(current.ledger, {
    actionId,
    actor,
    channel: actor.kind === 'human' ? 'manual' : 'mcp',
    operations: migration.operations,
    expectedRevision: current.ledger.compositionRevision,
    publishedAt: new Date().toISOString(),
    precondition: { workspaceRevision, refHead: current.basis.refHead },
    reason,
  });
  if (published.kind === 'conflict' || published.kind === 'rejected')
    throw new StudioError('CONFLICT', published.message);
  const built = buildAuthoringEffect(published.ledger);
  if (
    describeTransitionObject(built.result).digest !==
    describeTransitionObject(createYOpsState(migration.document)).digest
  )
    throw new TypeError('Schema migration replay mismatch.');
  return published.ledger;
}

/** Append content action and bind its exact Schema in ONE existing authoring transaction. No Commit. */
export async function prepareWorkspaceSchema(
  c: Context,
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  input: SchemaPreparationApplyInput,
  actor: DraftActionActor
) {
  const initial = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!initial?.workspace_state) throw new StudioError('NOT_FOUND', 'Workspace is unavailable.');
  const { basis } = workspaceAuthoringState(initial.workspace_state);
  const requestDigest = await sha256CompositionValue({ input, actor });
  const saved = await transactWorkspaceAuthoring<{
    outcome: 'prepared' | 'reused';
    workspaceRevision: number;
    compositionRevision: number;
    schemaHash: string;
  }>(db, { projectId, workspaceId, refName: basis.refName }, async (tx, draft) => {
    const workspace = draft.workspace_state!;
    if ((await assertProjectAccess(c, tx, projectId, 'project:edit')) instanceof Response)
      throw new StudioError('FORBIDDEN', 'Workspace edit authority changed.');
    const receipts = (
      Array.isArray(workspace.schemaPreparations) ? workspace.schemaPreparations : []
    ) as Array<{
      requestId: string;
      requestDigest: string;
      source: Source;
      schemaHash: string;
      workspaceRevision: number;
      compositionRevision: number;
    }>;
    const prior = receipts.find((receipt) => receipt.requestId === input.requestId);
    if (prior) {
      if (prior.requestDigest !== requestDigest)
        throw new StudioError(
          'CONFLICT',
          'Preparation request identity was reused with different facts.'
        );
      await resolveSource(c, tx, projectId, workspaceId, workspace, prior.source);
      return {
        workspace: null,
        value: {
          outcome: 'reused' as const,
          workspaceRevision: prior.workspaceRevision,
          compositionRevision: prior.compositionRevision,
          schemaHash: prior.schemaHash,
        },
      };
    }
    const { previewHash: _hash, requestId: _id, ...previewInput } = input;
    const prepared = await previewWorkspaceSchemaPreparation(
      c,
      tx,
      projectId,
      workspaceId,
      previewInput
    );
    if (prepared.view.previewHash !== input.previewHash)
      throw new StudioError('CONFLICT', 'Migration preview changed. Preview it again.');
    if (!prepared.view.canPrepare)
      throw new StudioError(
        'REVIEW_REQUIRED',
        'Resolve content gaps and confirm all mappings before preparing.'
      );
    const actionId = `schema-preparation:${input.requestId}`;
    const ledger = publishSchemaPreparationContent(
      workspace,
      draft.revision,
      prepared.migration,
      actor,
      actionId,
      'User-confirmed Schema content preparation'
    );
    const snapshotHash = await sha256CompositionValue({
      profile: 'schema-content-preparation/v1',
      selectionHash: prepared.target.selectionHash,
      schemaHash: prepared.target.schemaHash,
    });
    const compositionId = `prepared:${snapshotHash}`;
    await saveYSchemaCompositionSnapshot(tx, {
      snapshot_id: `schema-prepared:${projectId}:${snapshotHash}`,
      project_id: projectId,
      composition_id: compositionId,
      composition_revision: 1,
      composition_hash: snapshotHash,
      compiled_schema_hash: prepared.target.schemaHash,
      compiler_version: 'schema-content-preparation@1',
      manifest_json: {
        source: prepared.source,
        selectionHash: prepared.target.selectionHash,
        ...('sources' in prepared.target ? { sources: prepared.target.sources } : {}),
      },
      schema_json: { ...prepared.target.schema },
      render_plan_json: prepared.target.renderPlan,
      origins_json: prepared.target.origins,
    });
    const result = {
      outcome: 'prepared' as const,
      workspaceRevision: draft.revision + 1,
      compositionRevision: ledger.compositionRevision,
      schemaHash: prepared.target.schemaHash,
    };
    const { schemaPending: _pending, ...unchanged } = workspace;
    return {
      workspace: {
        ...unchanged,
        updatedAt: new Date().toISOString(),
        authoringLedger: ledger,
        schemaBindings: [
          {
            canonicalName: prepared.target.publishedReference?.canonicalName ?? compositionId,
            schemaName:
              prepared.target.publishedReference?.schemaName ?? prepared.target.schema.name,
            version: prepared.target.publishedReference?.version ?? '1',
            rootKey: prepared.view.rootKey,
            mode: prepared.target.bindingMode,
            compositionId,
            compositionRevision: 1,
            compositionHash: snapshotHash,
            schemaHash: prepared.target.schemaHash,
          },
        ],
        schemaPreparations: [
          ...receipts,
          {
            ...result,
            requestId: input.requestId,
            requestDigest,
            source: prepared.source,
            previewHash: input.previewHash,
            actionId,
            actor,
            request: input,
          },
        ],
      },
      value: result,
    };
  });
  return saved.value;
}
