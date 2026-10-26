import {
  type SaveStudioSchemaEditCandidateInput,
  StudioSchemaEditCandidateSchema,
} from '@t3x-dev/api-client';
import {
  type DraftDocument,
  parseSchemaSourceMappings,
  parseWorkspaceSchemaEditCandidate,
  saveWorkspaceSchemaEditCandidate,
  type WorkspaceSchemaEditOrigin,
} from '@t3x-dev/application';
import { compileWorkspaceSchemaDefinition } from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  findWorkspaceDraft,
  findYSchemaCompositionSnapshot,
  saveWorkspaceSchemaPreparation,
  saveYSchemaCompositionSnapshot,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { readNodeProvenance } from './schema-node-provenance';
import {
  applySchemaSourceMappings,
  type ResolveSchemaMappingSource,
} from './schema-source-mappings';
import { type compileStudioSelection, StudioError } from './schema-studio-preview';
import type { WorkspaceSchemaEditBasis } from './workspace-schema-edit-basis';

/** Shared Studio/Chat application service. Callers must authorize the exact source selection. */
export async function saveStudioEditCandidate(
  db: AnyDB,
  projectId: string,
  input: SaveStudioSchemaEditCandidateInput,
  selection: Awaited<ReturnType<typeof compileStudioSelection>>,
  origin: WorkspaceSchemaEditOrigin,
  guard?: {
    workspaceRevision: number;
    assistantSchemaSettings: unknown;
    basis?: WorkspaceSchemaEditBasis;
  },
  resolveMappingSource?: ResolveSchemaMappingSource
) {
  if ((input.rebase || Object.keys(input.composition ?? {}).length) && !input.schemaDefinition)
    throw new StudioError(
      'INVALID_REQUEST',
      'Source combination requires a complete Schema definition and its exact Base hash.'
    );
  if (!selection.report.valid && (input.rebase || input.schemaDefinition))
    throw new StudioError(
      'REVIEW_REQUIRED',
      'Resolve all source composition conflicts before saving.'
    );
  let base = guard?.basis;
  if (!base && input.schemaDefinition && !input.rebase) {
    const previous = await findWorkspaceDraft(db, projectId, input.workspaceId);
    const stored = previous?.workspace_state?.schemaEditCandidate;
    const edit = stored ? parseWorkspaceSchemaEditCandidate(stored) : null;
    const reference = edit?.authoringDraft?.base;
    if (reference?.kind === 'composition') {
      const snapshot = await findYSchemaCompositionSnapshot(db, {
        project_id: projectId,
        composition_id: reference.compositionId,
        composition_revision: reference.compositionRevision,
        compiled_schema_hash: reference.schemaHash,
      });
      if (
        !snapshot ||
        snapshot.compositionHash !== reference.compositionHash ||
        ((snapshot.manifestJson as { selectionHash?: string }).selectionHash &&
          (snapshot.manifestJson as { selectionHash?: string }).selectionHash !==
            selection.selectionHash) ||
        (await sha256CompositionValue(normalizeYSchemaObject(snapshot.schemaJson))) !==
          reference.schemaHash ||
        (await sha256CompositionValue(edit!.baseSources)) !==
          (await sha256CompositionValue(selection.sources))
      )
        throw new StudioError('CONFLICT', 'Reload the exact saved Schema editing Base.');
      base = {
        reference,
        schema: normalizeYSchemaObject(snapshot.schemaJson),
        schemaHash: reference.schemaHash,
        sources: selection.sources,
        selectionHash: selection.selectionHash,
        renderPlan: snapshot.renderPlanJson as Record<string, unknown>[],
        origins: snapshot.originsJson,
        nodeProvenance: readNodeProvenance(snapshot.manifestJson.nodeProvenance),
      };
    }
  }
  const baseSchema = base?.schema ?? selection.schema;
  const baseHash = base?.schemaHash ?? selection.schemaHash;
  if (
    input.schemaDefinition &&
    (input.baseSchemaHash !== baseHash || Object.keys(input.localContribution).length)
  )
    throw new StudioError(
      'CONFLICT',
      'Reload the exact Base and submit either a Schema Effect or a local contribution.'
    );
  const applied = input.schemaDefinition
    ? await compileWorkspaceSchemaDefinition(baseSchema, input.schemaDefinition)
    : null;
  if (input.sourceMappings?.length && !applied)
    throw new StudioError(
      'INVALID_REQUEST',
      'Source mappings require a complete Schema definition.'
    );
  if (applied && input.sourceMappings)
    await applySchemaSourceMappings(
      { ...selection, ...(base ?? {}), schema: { ...baseSchema } },
      { ...applied.schema },
      input.sourceMappings,
      resolveMappingSource
    );
  if (applied && selection.modules.length) {
    await saveYSchemaCompositionSnapshot(db, {
      snapshot_id: `studio-authoring-base:${projectId}:${selection.selectionHash}`,
      project_id: projectId,
      composition_id: `studio:${selection.selectionHash}`,
      composition_revision: 1,
      composition_hash: selection.selectionHash,
      compiled_schema_hash: selection.schemaHash,
      compiler_version: 'yschema-v2',
      manifest_json: {
        sources: selection.sources,
        selectionHash: selection.selectionHash,
        studioComposition: selection.composition,
        nodeProvenance: selection.nodeProvenance,
      },
      schema_json: { ...selection.schema },
      render_plan_json: selection.renderPlan,
      origins_json: selection.origins,
    });
  }
  const candidateId = `sec_${(await sha256CompositionValue({ projectId, workspaceId: input.workspaceId })).slice(7)}`;
  if (base)
    await saveYSchemaCompositionSnapshot(db, {
      snapshot_id: `schema-edit-base:${projectId}:${base.reference.compositionId}:${base.reference.compositionRevision}`,
      project_id: projectId,
      composition_id: base.reference.compositionId,
      composition_revision: base.reference.compositionRevision,
      composition_hash: base.reference.compositionHash,
      compiled_schema_hash: base.schemaHash,
      compiler_version: 'workspace-schema-edit-base@1',
      manifest_json: {
        sources: base.sources,
        selectionHash: base.selectionHash,
        studioComposition: selection.composition,
        nodeProvenance: base.nodeProvenance,
      },
      schema_json: { ...base.schema },
      render_plan_json: base.renderPlan,
      origins_json: base.origins,
    });
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await findWorkspaceDraft(db, projectId, input.workspaceId);
    if (!draft?.workspace_state)
      throw new StudioError('NOT_FOUND', 'The target Workspace does not exist.');
    if (guard && draft.revision !== guard.workspaceRevision)
      throw new StudioError('CONFLICT', 'Workspace changed. Confirm settings again.');
    const stored = draft.workspace_state.schemaEditCandidate;
    const result = saveWorkspaceSchemaEditCandidate(
      stored ? parseWorkspaceSchemaEditCandidate(stored) : null,
      {
        candidateId,
        workspaceId: input.workspaceId,
        expectedRevision: input.ifRevision,
        baseSources:
          selection.sources as readonly import('@t3x-dev/application').WorkspaceSchemaEditBaseSource[],
        localContribution: input.localContribution as DraftDocument,
        ...(applied
          ? {
              authoringDraft: {
                schema: 't3x.application/workspace-schema-authoring-draft/v1' as const,
                revision: input.ifRevision + 1,
                base:
                  base?.reference ??
                  (selection.modules.length === 0 && selection.sources.length === 1
                    ? {
                        kind: 'published_schema' as const,
                        projectId: selection.sources[0]!.projectId,
                        canonicalName: selection.sources[0]!.canonicalName,
                        version: selection.sources[0]!.version,
                        artifactVersionId: selection.sources[0]!.artifactVersionId,
                        artifactHash: selection.sources[0]!.hash as `sha256:${string}`,
                        schemaHash: selection.schemaHash as `sha256:${string}`,
                      }
                    : {
                        kind: 'composition' as const,
                        compositionId: `studio:${selection.selectionHash}`,
                        compositionRevision: 1,
                        compositionHash: selection.selectionHash as `sha256:${string}`,
                        schemaHash: selection.schemaHash as `sha256:${string}`,
                      }),
                effect: { profile: 'yops.ops.v1' as const, operations: applied.operations },
                resultSchemaHash: applied.schemaHash,
                ...(input.sourceMappings
                  ? { sourceMappings: parseSchemaSourceMappings(input.sourceMappings) }
                  : {}),
              },
            }
          : {}),
        intent: input.intent,
        origin,
        retryKey: input.retryKey,
      }
    );
    if (result.kind === 'conflict')
      throw new StudioError('CONFLICT', result.message, {
        reason: result.reason,
        currentRevision: result.currentRevision,
      });
    if (result.kind === 'reused')
      return {
        outcome: result.kind,
        workspaceRevision: draft.revision,
        candidate: StudioSchemaEditCandidateSchema.parse({
          ...result.candidate,
          composition: selection.composition,
          ...(result.candidate.authoringDraft?.base.kind === 'composition'
            ? { baseDefinition: { ...baseSchema } }
            : {}),
        }),
      };
    try {
      const saved = await saveWorkspaceSchemaPreparation(db, {
        projectId,
        workspaceId: input.workspaceId,
        expectedRevision: draft.revision,
        schemaEditCandidate: result.candidate,
        ...(guard ? { assistantSchemaSettings: guard.assistantSchemaSettings } : {}),
      });
      return {
        outcome: result.kind,
        workspaceRevision: saved.revision,
        candidate: StudioSchemaEditCandidateSchema.parse({
          ...result.candidate,
          composition: selection.composition,
          ...(result.candidate.authoringDraft?.base.kind === 'composition'
            ? { baseDefinition: { ...baseSchema } }
            : {}),
        }),
      };
    } catch (error) {
      if (error instanceof ConflictError && attempt === 0 && !guard) continue;
      throw error;
    }
  }
  throw new StudioError('CONFLICT', 'The Workspace changed. Retry the Schema edit.');
}
