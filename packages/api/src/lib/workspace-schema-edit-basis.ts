import { StudioSourceSchema } from '@t3x-dev/api-client';
import type { WorkspaceSchemaCompositionBase } from '@t3x-dev/application';
import {
  type AnyDB,
  findSchemaStudioCandidate,
  findYSchemaArtifactVersion,
  findYSchemaCompositionSnapshot,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue, type YSchema } from '@t3x-dev/yschema';
import type { Context } from 'hono';
import type { z } from 'zod';
import { resolveStudioSource, schemaSourceAdoptionReason } from './schema-studio';
import { StudioError } from './schema-studio-preview';
import { ensureBuiltInYSchemaArtifacts } from './yschema-artifact-registry';

export interface WorkspaceSchemaEditBasis {
  composition?: Record<string, string>;
  schema: YSchema;
  schemaHash: string;
  reference: WorkspaceSchemaCompositionBase;
  sources: z.infer<typeof StudioSourceSchema>[];
  selectionHash: string;
  renderPlan: Record<string, unknown>[];
  origins: Record<string, unknown>;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Recover provenance from the bound snapshot/its matching receipt, never the latest edit. */
export async function resolveWorkspaceSchemaEditBasis(
  c: Context,
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>,
  schema: YSchema
): Promise<WorkspaceSchemaEditBasis> {
  const binding = record((workspace.schemaBindings as unknown[])?.[0]);
  const schemaHash = await sha256CompositionValue(schema);
  const snapshot =
    typeof binding.compositionId === 'string' && Number.isInteger(binding.compositionRevision)
      ? await findYSchemaCompositionSnapshot(db, {
          project_id: projectId,
          composition_id: binding.compositionId,
          composition_revision: Number(binding.compositionRevision),
          compiled_schema_hash: schemaHash,
        })
      : null;
  if (
    binding.compositionId &&
    (!snapshot ||
      snapshot.compositionHash !== binding.compositionHash ||
      (await sha256CompositionValue(normalizeYSchemaObject(snapshot.schemaJson))) !== schemaHash)
  )
    throw new StudioError('CONFLICT', 'The exact bound Schema snapshot is unavailable or changed.');
  const manifest = record(snapshot?.manifestJson);
  let sources: unknown = manifest.sources ?? binding.studioSources;
  if (!sources && snapshot) {
    const receipts = Array.isArray(workspace.schemaPreparations)
      ? workspace.schemaPreparations
      : [];
    const receipt = receipts
      .map(record)
      .reverse()
      .find((entry) => entry.schemaHash === schemaHash);
    const source = record(manifest.source ?? receipt?.source);
    if (source.kind === 'studio' && Array.isArray(source.candidateIds)) {
      sources = await Promise.all(
        source.candidateIds.map(async (id) => {
          const row =
            typeof id === 'string' ? await findSchemaStudioCandidate(db, projectId, id) : null;
          if (!row)
            throw new StudioError(
              'CONFLICT',
              'The bound snapshot’s exact source references are unavailable.'
            );
          return {
            projectId: row.sourceProjectId,
            canonicalName: row.canonicalName,
            version: row.version,
            artifactVersionId: row.artifactVersionId,
            hash: row.artifactHash,
          };
        })
      );
    }
  }
  if (!sources && !snapshot) {
    await ensureBuiltInYSchemaArtifacts(db);
    const name = binding.canonicalName ?? binding.schemaName;
    const view =
      typeof name === 'string' && typeof binding.version === 'string'
        ? await findYSchemaArtifactVersion(db, {
            project_id: projectId,
            canonical_name: name,
            version: binding.version,
          })
        : null;
    if (
      view &&
      record(view.manifest).schema &&
      (await sha256CompositionValue(normalizeYSchemaObject(view.manifest.schema))) === schemaHash
    )
      sources = [
        {
          projectId: view.ownerProjectId,
          canonicalName: view.canonicalName,
          version: view.version,
          artifactVersionId: view.artifactVersionId,
          hash: view.artifactHash,
        },
      ];
  }
  const parsed = StudioSourceSchema.array().min(1).safeParse(sources);
  if (!parsed.success)
    throw new StudioError(
      'CONFLICT',
      'The bound snapshot has no exact recoverable source provenance.'
    );
  for (const source of parsed.data) {
    const view = await resolveStudioSource(c, db, {
      sourceProjectId: source.projectId,
      canonicalName: source.canonicalName,
      version: source.version,
      artifactHash: source.hash,
    });
    if (!view || view.artifactVersionId !== source.artifactVersionId)
      throw new StudioError('FORBIDDEN', 'A bound source is unavailable or no longer authorized.');
    const reason = await schemaSourceAdoptionReason(c, db, projectId, view);
    if (reason) throw new StudioError('FORBIDDEN', reason);
  }
  const selectionHash = await sha256CompositionValue({
    apiVersion: 't3x.dev/studio-selection/v1',
    projectId,
    sources: parsed.data,
    ...(Object.keys(record(manifest.studioComposition)).length
      ? { composition: manifest.studioComposition }
      : {}),
  });
  if (manifest.selectionHash && manifest.selectionHash !== selectionHash)
    throw new StudioError(
      'CONFLICT',
      'The bound snapshot’s source selection failed integrity verification.'
    );
  const compositionHash =
    snapshot?.compositionHash ??
    (await sha256CompositionValue({
      profile: 'workspace-schema-edit-base/v1',
      binding,
      schemaHash,
    }));
  return {
    composition: manifest.studioComposition as Record<string, string> | undefined,
    schema,
    schemaHash,
    sources: parsed.data,
    selectionHash,
    reference: {
      kind: 'composition',
      compositionId: snapshot?.compositionId ?? `bound:${compositionHash}`,
      compositionRevision: snapshot?.compositionRevision ?? 1,
      compositionHash: compositionHash as `sha256:${string}`,
      schemaHash: schemaHash as `sha256:${string}`,
    },
    renderPlan: (snapshot?.renderPlanJson ?? []) as Record<string, unknown>[],
    origins: (snapshot?.originsJson ?? {}) as Record<string, unknown>,
  };
}
