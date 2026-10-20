import {
  type SaveStudioSchemaEditCandidateInput,
  StudioSchemaEditCandidateSchema,
} from '@t3x-dev/api-client';
import {
  type DraftDocument,
  parseWorkspaceSchemaEditCandidate,
  saveWorkspaceSchemaEditCandidate,
  type WorkspaceSchemaEditOrigin,
} from '@t3x-dev/application';
import { compileWorkspaceSchemaDefinition } from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  findWorkspaceDraft,
  saveWorkspaceSchemaPreparation,
  saveYSchemaCompositionSnapshot,
} from '@t3x-dev/storage';
import { sha256CompositionValue } from '@t3x-dev/yschema';
import { type compileStudioSelection, StudioError } from './schema-studio-preview';

/** Shared Studio/Chat application service. Callers must authorize the exact source selection. */
export async function saveStudioEditCandidate(
  db: AnyDB,
  projectId: string,
  input: SaveStudioSchemaEditCandidateInput,
  selection: Awaited<ReturnType<typeof compileStudioSelection>>,
  origin: WorkspaceSchemaEditOrigin,
  guard?: { workspaceRevision: number; assistantSchemaSettings: unknown }
) {
  if (
    input.schemaDefinition &&
    (input.baseSchemaHash !== selection.schemaHash || Object.keys(input.localContribution).length)
  )
    throw new StudioError(
      'CONFLICT',
      'Reload the exact Base and submit either a Schema Effect or a local contribution.'
    );
  const applied = input.schemaDefinition
    ? await compileWorkspaceSchemaDefinition(selection.schema, input.schemaDefinition)
    : null;
  if (applied && selection.modules.length) {
    await saveYSchemaCompositionSnapshot(db, {
      snapshot_id: `studio-authoring-base:${projectId}:${selection.selectionHash}`,
      project_id: projectId,
      composition_id: `studio:${selection.selectionHash}`,
      composition_revision: 1,
      composition_hash: selection.selectionHash,
      compiled_schema_hash: selection.schemaHash,
      compiler_version: 'yschema-v2',
      manifest_json: { sources: selection.sources },
      schema_json: { ...selection.schema },
      render_plan_json: selection.renderPlan,
      origins_json: selection.origins,
    });
  }
  const candidateId = `sec_${(await sha256CompositionValue({ projectId, workspaceId: input.workspaceId })).slice(7)}`;
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
                  selection.modules.length === 0 && selection.sources.length === 1
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
                      },
                effect: { profile: 'yops.ops.v1' as const, operations: applied.operations },
                resultSchemaHash: applied.schemaHash,
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
        candidate: StudioSchemaEditCandidateSchema.parse(result.candidate),
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
        candidate: StudioSchemaEditCandidateSchema.parse(result.candidate),
      };
    } catch (error) {
      if (error instanceof ConflictError && attempt === 0 && !guard) continue;
      throw error;
    }
  }
  throw new StudioError('CONFLICT', 'The Workspace changed. Retry the Schema edit.');
}
