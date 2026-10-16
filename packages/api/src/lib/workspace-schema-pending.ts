import {
  type SchemaEvolutionImpact,
  type WorkspaceSchemaPending,
  WorkspaceSchemaPendingSchema,
  type WorkspaceSchemaPendingView,
} from '@t3x-dev/api-client';
import type { Draft } from '@t3x-dev/core';
import { type AnyDB, saveWorkspaceSchemaPreparation } from '@t3x-dev/storage';
import {
  compileYSchemaComposition,
  compileYSchemaCompositionV2,
  sha256CompositionValue,
  type YSchemaCompositionDraft,
  type YSchemaCompositionDraftV2,
} from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { assessWorkspaceSchemaImpact } from './schema-evolution-impact';
import { compileStudioSelection, previewStudio, StudioError } from './schema-studio-preview';
import {
  resolveCompositionArtifacts,
  resolveCompositionArtifactsV2,
} from './yschema-artifact-registry';

/** Adopt records a preparation task only; effective Schema and authoring content are untouched. */
export async function savePendingWorkspaceSchema(
  db: AnyDB,
  projectId: string,
  draft: Draft,
  input: {
    workspaceId: string;
    ifRevision: number;
    reviewHash: string;
    selectionHash: string;
    schemaHash: string;
    contentHash: string | null;
    source: WorkspaceSchemaPending['source'];
  }
) {
  if (!draft.workspace_state || draft.revision !== input.ifRevision)
    throw new StudioError('CONFLICT', 'The Workspace changed. Review the candidate again.');
  const pending = WorkspaceSchemaPendingSchema.parse({
    schema: 't3x.dev/workspace-schema-pending/v1',
    pendingId: await sha256CompositionValue({
      projectId,
      workspaceId: input.workspaceId,
      reviewHash: input.reviewHash,
    }),
    workspaceId: input.workspaceId,
    targetBranch: draft.target_branch ?? String(draft.workspace_state.targetBranch ?? 'main'),
    baseWorkspaceRevision: input.ifRevision,
    workspaceRevision: input.ifRevision + 1,
    reviewHash: input.reviewHash,
    selectionHash: input.selectionHash,
    schemaHash: input.schemaHash,
    contentHash: input.contentHash,
    bindingHash: await sha256CompositionValue(draft.workspace_state.schemaBindings ?? []),
    source: input.source,
  });
  const saved = await saveWorkspaceSchemaPreparation(db, {
    projectId,
    workspaceId: input.workspaceId,
    expectedRevision: input.ifRevision,
    schemaPending: pending,
  });
  return { workspaceRevision: saved.revision, outcome: 'pending_preparation' as const, pending };
}

/** Live read: retain persisted intent but never treat a stale or unauthorized preview as approval. */
export async function readPendingWorkspaceSchema(
  c: Context,
  db: AnyDB,
  projectId: string,
  draft: Draft
): Promise<WorkspaceSchemaPendingView> {
  const stored = draft.workspace_state?.schemaPending;
  if (stored === undefined) return { status: 'none', pending: null, reason: null, impact: null };
  const parsed = WorkspaceSchemaPendingSchema.safeParse(stored);
  if (!parsed.success)
    return {
      status: 'unavailable',
      pending: null,
      reason: 'The saved Schema preparation task could not be read.',
      impact: null,
    };
  const pending = parsed.data;
  if (pending.workspaceId !== draft.workspace_id)
    return {
      status: 'unavailable',
      pending: null,
      reason: 'Schema preparation task identity does not match.',
      impact: null,
    };
  let selectionHash: string;
  let schemaHash: string;
  let impact: SchemaEvolutionImpact | null;
  try {
    if (pending.source.kind === 'studio') {
      // Check live source authority even when the saved candidate revision is stale.
      const sources = await compileStudioSelection(c, db, projectId, pending.source.candidateIds);
      if (!sources.adoption.allowed)
        throw new StudioError('FORBIDDEN', 'Source adoption is no longer authorized.');
      const preview = await previewStudio(c, db, projectId, {
        candidateIds: pending.source.candidateIds,
        workspaceId: pending.workspaceId,
        ...(pending.source.schemaEditCandidate
          ? { schemaEditCandidate: pending.source.schemaEditCandidate }
          : {}),
      });
      selectionHash = preview.selectionHash;
      schemaHash = preview.schemaHash;
      impact = preview.impact;
      if (!preview.report.valid || !preview.adoption.allowed || !impact?.canAdopt)
        return {
          status: 'stale',
          pending,
          reason: 'This candidate needs new checks before preparation.',
          impact: null,
        };
    } else {
      const composition = draft.workspace_state?.schemaComposition as
        | YSchemaCompositionDraft
        | YSchemaCompositionDraftV2
        | undefined;
      if (
        !composition ||
        composition.id !== pending.source.compositionId ||
        composition.revision !== pending.source.revision
      )
        throw new StudioError('CONFLICT', 'The saved Composition changed. Review it again.');
      const preview =
        composition.apiVersion === 't3x.dev/yschema-composition/v2'
          ? await compileYSchemaCompositionV2({
              composition,
              modules: await resolveCompositionArtifactsV2(db, composition, projectId),
            })
          : await compileYSchemaComposition({
              composition,
              ...(await resolveCompositionArtifacts(db, composition, projectId)),
            });
      selectionHash = preview.compositionHash;
      schemaHash = preview.compiledSchemaHash;
      impact = await assessWorkspaceSchemaImpact(
        db,
        projectId,
        draft.workspace_state!,
        preview.schema,
        preview.report.valid
      );
      if (!preview.report.valid || !impact.canAdopt)
        return {
          status: 'stale',
          pending,
          reason: 'The Composition needs new checks before preparation.',
          impact: null,
        };
    }
  } catch (error) {
    if (error instanceof StudioError && error.code === 'CONFLICT')
      return { status: 'stale', pending, reason: error.message, impact: null };
    return {
      status: 'unavailable',
      pending: null,
      reason:
        'A source is unavailable or no longer authorized. The saved candidate has been retained.',
      impact: null,
    };
  }
  if (
    draft.revision !== pending.workspaceRevision ||
    schemaHash !== pending.schemaHash ||
    selectionHash !== pending.selectionHash ||
    impact?.content.hash !== pending.contentHash ||
    (await sha256CompositionValue(draft.workspace_state?.schemaBindings ?? [])) !==
      pending.bindingHash ||
    (draft.target_branch ?? 'main') !== pending.targetBranch
  )
    return {
      status: 'stale',
      pending,
      reason: 'The Workspace or candidate changed. Review it again before preparation.',
      impact: null,
    };
  return { status: 'pending_preparation', pending, reason: null, impact };
}
