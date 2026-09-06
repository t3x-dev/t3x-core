import type { StudioPreviewInput } from '@t3x-dev/api-client';
import { type AnyDB, findSchemaStudioCandidate, findWorkspaceDraft } from '@t3x-dev/storage';
import {
  builtInYSchemaCores,
  builtInYSchemaModules,
  compileYSchemaCompositionV2,
  diffYSchemas,
  normalizeYSchemaObject,
  sha256CompositionValue,
} from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { assertProjectAccess } from './project-access';
import { resolveStudioSource } from './schema-studio';
import { resolveWorkspaceYSchema } from './workspace-yschema';
import { artifactViewToOpenModule } from './yschema-artifact-registry';
export class StudioError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'INVALID_REQUEST' | 'CONFLICT' | 'FORBIDDEN',
    message: string
  ) {
    super(message);
  }
}
const licenses = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0']);
export async function compileStudioSelection(
  c: Context,
  db: AnyDB,
  projectId: string,
  candidateIds: string[]
) {
  const entries = await Promise.all(
    candidateIds.map(async (id) => {
      const row = await findSchemaStudioCandidate(db, projectId, id);
      const view = row ? await resolveStudioSource(c, db, row) : null;
      if (!row || !view)
        throw new StudioError(
          'NOT_FOUND',
          'A selected source is unavailable or no longer authorized.'
        );
      return { row, view };
    })
  );
  const sources = entries.map(({ row }) => ({
    projectId: row.sourceProjectId,
    canonicalName: row.canonicalName,
    version: row.version,
    hash: row.artifactHash,
    artifactVersionId: row.artifactVersionId,
  }));
  const selectionHash = await sha256CompositionValue({
    apiVersion: 't3x.dev/studio-selection/v1',
    projectId,
    sources,
  });
  let adoptionReason: string | null = null;
  for (const { view } of entries) {
    if (view.ownerProjectId === projectId) continue;
    if (view.visibility === 'private' || view.visibility === 'team') {
      if (
        !view.ownerProjectId ||
        (await assertProjectAccess(c, db, view.ownerProjectId, 'project:edit')) instanceof Response
      )
        adoptionReason =
          'Importing private structure requires edit authority on its source project.';
    } else {
      const builtIn = [...builtInYSchemaCores, ...builtInYSchemaModules].find(
        (item) => item.canonicalName === view.canonicalName && item.version === view.version
      );
      const repositoryOwned =
        builtIn && (await sha256CompositionValue(builtIn)) === view.artifactHash;
      if (
        !repositoryOwned &&
        !(typeof view.manifest.license === 'string' && licenses.has(view.manifest.license))
      )
        adoptionReason =
          'This release has no supported declared redistribution license. Ask its publisher before importing.';
    }
  }
  const whole = entries.filter(({ view }) => view.kind === 'schema');
  if (whole.length && entries.length !== 1)
    throw new StudioError(
      'INVALID_REQUEST',
      'A published Schema is adopted whole. Select it alone or compose declared Modules separately.'
    );
  if (whole.length) {
    const view = whole[0]!.view;
    if (view.manifest.apiVersion !== 't3x.dev/yschema-blueprint/v1')
      throw new StudioError('INVALID_REQUEST', 'Unsupported published Schema definition.');
    const schema = normalizeYSchemaObject(view.manifest.schema);
    const schemaHash = await sha256CompositionValue(schema);
    const registry = view.manifest.registry as Record<string, unknown> | undefined;
    if (registry?.compiledSchemaHash !== schemaHash)
      throw new StudioError(
        'CONFLICT',
        'Published Schema integrity does not match its compiled definition.'
      );
    return {
      schema,
      schemaHash,
      selectionHash,
      sources,
      report: { valid: true, issues: [] },
      renderPlan: (registry.renderPlan ?? []) as Record<string, unknown>[],
      origins: (registry.originsByPath ?? {}) as Record<string, unknown>,
      adoption: { allowed: !adoptionReason, reason: adoptionReason },
    };
  }
  const compiled = await compileYSchemaCompositionV2({
    composition: {
      apiVersion: 't3x.dev/yschema-composition/v2',
      id: `studio:${selectionHash}`,
      revision: 1,
      status: 'draft',
      modules: entries.map(({ view }, index) => ({
        canonicalName: view.canonicalName,
        version: view.version,
        presentationOrder: index * 10,
      })),
    },
    modules: entries.map(({ view }) => artifactViewToOpenModule(view)),
  });
  return {
    schema: compiled.schema,
    schemaHash: compiled.compiledSchemaHash,
    selectionHash,
    sources,
    report: compiled.report,
    renderPlan: compiled.renderPlan,
    origins: compiled.originsByPath,
    adoption: { allowed: !adoptionReason, reason: adoptionReason },
  };
}
export async function previewStudio(
  c: Context,
  db: AnyDB,
  projectId: string,
  input: StudioPreviewInput
) {
  const selected = await compileStudioSelection(c, db, projectId, input.candidateIds);
  let workspace = null;
  let baseSchemaHash: string | null = null;
  if (input.workspaceId) {
    const draft = await findWorkspaceDraft(db, projectId, input.workspaceId);
    if (!draft?.workspace_state)
      throw new StudioError('NOT_FOUND', 'Target Workspace is unavailable.');
    const resolved = await resolveWorkspaceYSchema(draft.workspace_state, db, projectId);
    const bindings = draft.workspace_state.schemaBindings;
    if (Array.isArray(bindings) && bindings.length && !resolved.schema)
      throw new StudioError(
        'CONFLICT',
        'The current Workspace binding cannot be resolved. Repair it before replacing it.'
      );
    const base =
      resolved.schema ??
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'Unbound Workspace',
        version: '1',
        nodes: {},
      });
    baseSchemaHash = await sha256CompositionValue(base);
    workspace = {
      id: input.workspaceId,
      revision: draft.revision,
      binding: Array.isArray(bindings)
        ? ((bindings[0] ?? null) as Record<string, unknown> | null)
        : null,
      changes: diffYSchemas(base, selected.schema),
    };
  }
  let comparison = null;
  if (input.compareToCandidateIds) {
    const previous = await compileStudioSelection(c, db, projectId, input.compareToCandidateIds);
    if (!previous.report.valid)
      throw new StudioError(
        'INVALID_REQUEST',
        'The comparison selection has blocking definition issues.'
      );
    comparison = {
      schemaHash: previous.schemaHash,
      changes: diffYSchemas(previous.schema, selected.schema),
    };
  }
  const reviewHash = await sha256CompositionValue({
    selectionHash: selected.selectionHash,
    schemaHash: selected.schemaHash,
    workspaceId: input.workspaceId ?? null,
    workspaceRevision: workspace?.revision ?? null,
    baseSchemaHash,
  });
  return {
    ...selected,
    schema: selected.schema as unknown as Record<string, unknown>,
    renderPlan: selected.renderPlan as unknown as Record<string, unknown>[],
    origins: selected.origins as unknown as Record<string, unknown>,
    reviewHash,
    workspace,
    comparison,
  };
}
