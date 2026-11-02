import { StudioSourceSchema } from '@t3x-dev/api-client';
import {
  parseWorkspaceSchemaEditCandidate,
  type WorkspaceSchemaCompositionBase,
} from '@t3x-dev/application';
import { applyWorkspaceSchemaYOps } from '@t3x-dev/core';
import {
  type AnyDB,
  findSchemaStudioCandidate,
  findYSchemaArtifactVersion,
  findYSchemaCompositionSnapshot,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import { normalizeYSchemaObject, sha256CompositionValue, type YSchema } from '@t3x-dev/yschema';
import type { Context } from 'hono';
import type { z } from 'zod';
import {
  publishedSchemaOrigins,
  readNodeProvenance,
  schemaOriginDefinitions,
  schemaOriginSources,
} from './schema-node-provenance';
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
  nodeProvenance: import('@t3x-dev/api-client').SchemaNodeProvenance;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Recover only the old whole-Release fallback bug, from the matching replayable receipt. */
async function recoverPublishedOrigins(
  c: Context,
  db: AnyDB,
  workspace: Record<string, unknown>,
  schema: YSchema,
  schemaHash: string,
  origins: Record<string, unknown>
) {
  if (!workspace.schemaEditCandidate) return origins;
  let candidate: ReturnType<typeof parseWorkspaceSchemaEditCandidate>;
  try {
    candidate = parseWorkspaceSchemaEditCandidate(workspace.schemaEditCandidate);
  } catch {
    return origins;
  }
  const authoring = candidate.authoringDraft;
  if (
    authoring?.base.kind !== 'published_schema' ||
    authoring.resultSchemaHash !== schemaHash ||
    authoring.sourceMappings?.length ||
    !Object.values(origins).some((value) => {
      const origin = record(value);
      return (
        origin.kind === 'local' &&
        origin.contributionId === candidate.candidateId &&
        origin.revision === candidate.revision
      );
    })
  )
    return origins;
  const base = authoring.base;
  const view = await resolveStudioSource(c, db, {
    sourceProjectId: base.projectId,
    canonicalName: base.canonicalName,
    version: base.version,
    artifactHash: base.artifactHash,
  });
  if (
    !view ||
    view.artifactVersionId !== base.artifactVersionId ||
    Object.keys(record(record(view.manifest.registry).originsByPath)).length
  )
    return origins;
  const before = normalizeYSchemaObject(view.manifest.schema);
  if ((await sha256CompositionValue(before)) !== base.schemaHash) return origins;
  const replayed = await applyWorkspaceSchemaYOps(before, authoring.effect.operations).catch(
    () => null
  );
  if (!replayed || replayed.schemaHash !== schemaHash) return origins;
  const source = {
    projectId: base.projectId,
    canonicalName: base.canonicalName,
    version: base.version,
    artifactVersionId: base.artifactVersionId,
    hash: base.artifactHash,
  };
  const inherited = publishedSchemaOrigins(before, source);
  const baseDefinitions = schemaOriginDefinitions(before);
  const result = { ...origins };
  for (const [path, definition] of schemaOriginDefinitions(schema)) {
    const origin = record(origins[path]);
    const previous = baseDefinitions.get(path);
    if (
      !previous ||
      origin.kind !== 'local' ||
      origin.contributionId !== candidate.candidateId ||
      origin.revision !== candidate.revision
    )
      continue;
    result[path] =
      canonicalizeProtocolValue(previous as ProtocolValue) ===
      canonicalizeProtocolValue(definition as ProtocolValue)
        ? inherited[path]
        : { kind: 'derived', sources: [inherited[path], origin] };
  }
  return result;
}

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
  let nodeProvenance = readNodeProvenance(manifest.nodeProvenance);
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
    ) {
      sources = [
        {
          projectId: view.ownerProjectId,
          canonicalName: view.canonicalName,
          version: view.version,
          artifactVersionId: view.artifactVersionId,
          hash: view.artifactHash,
        },
      ];
      nodeProvenance = readNodeProvenance(record(view.manifest.registry).nodeProvenance);
    }
  }
  const parsed = StudioSourceSchema.array().safeParse(sources);
  if (!parsed.success || (!parsed.data.length && !snapshot))
    throw new StudioError(
      'CONFLICT',
      'The bound snapshot has no exact recoverable source provenance.'
    );
  for (const source of [...parsed.data, ...schemaOriginSources(snapshot?.originsJson ?? {})]) {
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
    origins: await recoverPublishedOrigins(
      c,
      db,
      workspace,
      schema,
      schemaHash,
      (snapshot?.originsJson ?? {}) as Record<string, unknown>
    ),
    nodeProvenance,
  };
}
