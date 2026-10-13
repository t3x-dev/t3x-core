import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AddStudioCandidateSchema,
  StudioApplyInputSchema,
  StudioCandidateListSchema,
  StudioCandidateSchema,
  StudioPreviewInputSchema,
  StudioPreviewSchema,
} from '@t3x-dev/api-client';
import {
  addSchemaStudioCandidate,
  ConflictError,
  findWorkspaceDraft,
  listSchemaStudioCandidates,
  listYSchemaCatalogReleases,
  removeSchemaStudioCandidate,
  saveYSchemaCompositionSnapshot,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { parseYSchema, sha256CompositionValue } from '@t3x-dev/yschema';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { projectStudioCandidate, resolveStudioSource } from '../lib/schema-studio';
import { previewStudio, StudioError } from '../lib/schema-studio-preview';
import { ensureBuiltInYSchemaArtifacts } from '../lib/yschema-artifact-registry';
import { schemaRootKeyFromBinding } from '../lib/yschema-registry';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const params = z.object({ projectId: z.string().min(1) });
const errors = {
  403: {
    description: 'Access denied',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Unavailable source',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  409: {
    description: 'Version changed',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};
const listRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/schema-studio/candidates',
  tags: ['YSchema'],
  request: { params },
  responses: {
    200: {
      description: 'Authorized candidate projections',
      content: { 'application/json': { schema: SuccessResponseSchema(StudioCandidateListSchema) } },
    },
    ...errors,
  },
});
const addRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/candidates',
  tags: ['YSchema'],
  request: {
    params,
    body: { content: { 'application/json': { schema: AddStudioCandidateSchema } } },
  },
  responses: {
    200: {
      description: 'Exact candidate, including idempotent retries',
      content: { 'application/json': { schema: SuccessResponseSchema(StudioCandidateSchema) } },
    },
    ...errors,
  },
});
const removeRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{projectId}/schema-studio/candidates/{candidateId}',
  tags: ['YSchema'],
  request: { params: params.extend({ candidateId: z.string().min(1) }) },
  responses: {
    200: {
      description: 'Candidate removed; source unchanged',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ removed: z.literal(true) })),
        },
      },
    },
    ...errors,
  },
});
const readSourceRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/schema-studio/source',
  tags: ['YSchema'],
  summary: 'Read the exact authorized release without adding a candidate',
  request: { params, query: AddStudioCandidateSchema },
  responses: {
    200: {
      description: 'Verified release reading',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              artifactHash: z.string(),
              readme: z.string().nullable(),
              manifest: z.record(z.string(), z.unknown()),
            })
          ),
        },
      },
    },
    ...errors,
  },
});
export const schemaStudioRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
schemaStudioRoutes.openapi(readSourceRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const input = c.req.valid('query');
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  await ensureBuiltInYSchemaArtifacts(db);
  const view = await resolveStudioSource(c, db, {
    sourceProjectId: input.sourceProjectId ?? null,
    canonicalName: input.canonicalName,
    version: input.version,
    artifactHash: input.expectedHash,
  });
  if (!view)
    return errorResponse(
      c,
      'NOT_FOUND',
      'The selected release is unavailable or no longer authorized.'
    );
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      success: true as const,
      data: {
        artifactHash: view.artifactHash,
        readme: typeof view.manifest.readme === 'string' ? view.manifest.readme : null,
        manifest: view.manifest,
      },
    },
    200
  );
});

schemaStudioRoutes.openapi(listRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  const rows = await listSchemaStudioCandidates(db, projectId);
  const items = await Promise.all(rows.map((row) => projectStudioCandidate(c, db, row)));
  return c.json({ success: true as const, data: { items } }, 200);
});
schemaStudioRoutes.openapi(addRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const input = c.req.valid('json');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  await ensureBuiltInYSchemaArtifacts(db);
  if (input.sourceProjectId) {
    const sourceAccess = await assertProjectAccess(c, db, input.sourceProjectId, 'project:read');
    if (sourceAccess instanceof Response)
      return errorResponse(c, 'NOT_FOUND', 'Source release is unavailable or not authorized.');
  }
  let version = input.version;
  if (version === 'latest') {
    const latest = await listYSchemaCatalogReleases(db, {
      project_id: input.sourceProjectId,
      canonical_name: input.canonicalName,
      limit: 1,
    });
    if (!latest.items[0])
      return errorResponse(c, 'NOT_FOUND', 'No published release is available.');
    version = latest.items[0].release.version;
  }
  const source = {
    sourceProjectId: input.sourceProjectId ?? null,
    canonicalName: input.canonicalName,
    version,
  };
  const view = await resolveStudioSource(c, db, source);
  if (!view)
    return errorResponse(c, 'NOT_FOUND', 'Source release is unavailable or not authorized.');
  if (input.expectedHash && input.expectedHash !== view.artifactHash)
    return errorResponse(c, 'CONFLICT', 'Source release does not match the selected hash.');
  const id = `sc_${(await sha256CompositionValue({ projectId, artifactVersionId: view.artifactVersionId, hash: view.artifactHash })).slice(7)}`;
  const row = await addSchemaStudioCandidate(db, {
    id,
    projectId,
    ...source,
    artifactVersionId: view.artifactVersionId,
    artifactHash: view.artifactHash,
  });
  return c.json({ success: true as const, data: await projectStudioCandidate(c, db, row) }, 200);
});
schemaStudioRoutes.openapi(removeRoute, async (c) => {
  const db = await getDB();
  const { projectId, candidateId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  await removeSchemaStudioCandidate(db, projectId, candidateId);
  return c.json({ success: true as const, data: { removed: true as const } }, 200);
});

const previewRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/preview',
  tags: ['YSchema'],
  request: {
    params,
    body: { content: { 'application/json': { schema: StudioPreviewInputSchema } } },
  },
  responses: {
    200: {
      description: 'Read-only compiled selection and review preconditions',
      content: { 'application/json': { schema: SuccessResponseSchema(StudioPreviewSchema) } },
    },
    ...errors,
  },
});
const applyRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/apply',
  tags: ['YSchema'],
  request: {
    params,
    body: { content: { 'application/json': { schema: StudioApplyInputSchema } } },
  },
  responses: {
    200: {
      description: 'Explicit pinned Workspace binding',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({ workspaceRevision: z.number(), binding: z.record(z.string(), z.unknown()) })
          ),
        },
      },
    },
    ...errors,
  },
});
schemaStudioRoutes.openapi(previewRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  try {
    return c.json(
      { success: true as const, data: await previewStudio(c, db, projectId, c.req.valid('json')) },
      200
    );
  } catch (error) {
    if (error instanceof StudioError) return errorResponse(c, error.code, error.message);
    throw error;
  }
});
schemaStudioRoutes.openapi(applyRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const input = c.req.valid('json');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  try {
    const preview = await previewStudio(c, db, projectId, input);
    if (!preview.adoption.allowed)
      throw new StudioError(
        'FORBIDDEN',
        preview.adoption.reason ?? 'Source redistribution not authorized.'
      );
    if (!preview.report.valid)
      return errorResponse(c, 'REVIEW_REQUIRED', 'Selected definitions have blocking issues.');
    if (preview.reviewHash !== input.reviewHash || preview.workspace?.revision !== input.ifRevision)
      throw new StudioError(
        'CONFLICT',
        'The selection or Workspace changed. Review it again before applying.'
      );
    const draft = await findWorkspaceDraft(db, projectId, input.workspaceId);
    if (!draft?.workspace_state || draft.revision !== input.ifRevision)
      throw new StudioError('CONFLICT', 'The target Workspace changed.');
    const compositionId = `studio:${preview.selectionHash}`;
    const previousBindings = Array.isArray(draft.workspace_state.schemaBindings)
      ? draft.workspace_state.schemaBindings
      : [];
    const previousRootKey = schemaRootKeyFromBinding(previousBindings[0]);
    const binding = {
      rootKey: /^[a-z][a-z0-9_]*$/.test(previousRootKey) ? previousRootKey : 'candidate',
      canonicalName: compositionId,
      schemaName:
        preview.sources.length === 1 ? preview.sources[0]!.canonicalName : 'Studio selection',
      version: preview.sources.length === 1 ? preview.sources[0]!.version : '1',
      mode: 'pinned',
      schemaHash: preview.schemaHash,
      compositionId,
      compositionRevision: 1,
      compositionHash: preview.selectionHash,
      studioSources: preview.sources,
    };
    const {
      commitOverride: _override,
      extractionProposal: _proposal,
      ...previous
    } = draft.workspace_state;
    const oldYops =
      previous.yopsDraft && typeof previous.yopsDraft === 'object'
        ? (previous.yopsDraft as Record<string, unknown>)
        : {};
    const state = {
      ...previous,
      status: 'draft',
      schemaBindings: [binding],
      schemaCandidate: {
        summary: 'The pinned Schema changed. Regenerate or repair the candidate.',
        fields: [],
      },
      schemaReview: {
        verdict: 'needs_review',
        summary: 'Previous validation belongs to a different Schema.',
        gaps: ['Revalidate against the pinned Studio selection.'],
      },
      yopsDraft: {
        ...oldYops,
        id: typeof oldYops.id === 'string' ? oldYops.id : `studio:${input.workspaceId}`,
        operations: [],
      },
      updatedAt: new Date().toISOString(),
    };
    const saved = await db.transaction(async (tx) => {
      await saveYSchemaCompositionSnapshot(tx, {
        snapshot_id: `studio_${preview.selectionHash.slice(7)}`,
        project_id: projectId,
        composition_id: compositionId,
        composition_revision: 1,
        composition_hash: preview.selectionHash,
        compiled_schema_hash: preview.schemaHash,
        compiler_version: 'studio-selection@1',
        manifest_json: { apiVersion: 't3x.dev/studio-selection/v1', sources: preview.sources },
        schema_json: preview.schema,
        render_plan_json: preview.renderPlan,
        origins_json: preview.origins,
      });
      return upsertWorkspaceDraft(
        tx,
        {
          project_id: projectId,
          workspace_id: input.workspaceId,
          title: String(previous.title ?? input.workspaceId),
          target_branch: String(previous.targetBranch ?? 'main'),
          parent_commit_hash:
            typeof previous.baseCommitHash === 'string' ? previous.baseCommitHash : null,
          workspace_state: state,
        },
        input.ifRevision
      );
    });
    return c.json(
      { success: true as const, data: { workspaceRevision: saved.revision, binding } },
      200
    );
  } catch (error) {
    if (error instanceof StudioError) return errorResponse(c, error.code, error.message);
    if (error instanceof ConflictError)
      return errorResponse(c, 'CONFLICT', 'The Workspace changed. Review it again.');
    throw error;
  }
});

// Initial YAML binding is restricted to an empty Workspace; existing proposals use Studio review.
const initialSchemaRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/initial-schema',
  tags: ['YSchema'],
  request: {
    params,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              workspaceId: z.string().min(1),
              ifRevision: z.number().int().nonnegative(),
              filename: z.string().max(255),
              yaml: z
                .string()
                .min(1)
                .max(5 * 1024 * 1024),
            })
            .strict(),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Initial schema bound',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ workspaceRevision: z.number() })),
        },
      },
    },
    ...errors,
    400: {
      description: 'Invalid schema',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
schemaStudioRoutes.openapi(initialSchemaRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  const input = c.req.valid('json');
  let schema;
  try {
    schema = parseYSchema(input.yaml);
  } catch (error) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      error instanceof Error ? error.message : 'Invalid YSchema'
    );
  }
  const draft = await findWorkspaceDraft(db, projectId, input.workspaceId);
  if (!draft?.workspace_state)
    return errorResponse(c, 'CONFLICT', 'Workspace changed; reload before importing.');
  const state = draft.workspace_state;
  const hash = await sha256CompositionValue(schema);
  const existing = Array.isArray(state.schemaBindings)
    ? (state.schemaBindings[0] as Record<string, unknown> | undefined)
    : undefined;
  if (existing?.compositionId === `uploaded:${hash}`)
    return c.json({ success: true as const, data: { workspaceRevision: draft.revision } }, 200);
  if (draft.revision !== input.ifRevision)
    return errorResponse(c, 'CONFLICT', 'Workspace changed; reload before importing.');
  const yops = state.yopsDraft as { operations?: unknown[] } | undefined;
  if (
    state.baseCommitHash ||
    state.lastCommitHash ||
    (yops?.operations?.length ?? 0) > 0 ||
    (Array.isArray(state.schemaBindings) && state.schemaBindings.length > 0)
  )
    return errorResponse(c, 'CONFLICT', 'Initial schema requires an empty, unbound Workspace.');
  const compositionId = `uploaded:${hash}`;
  try {
    const saved = await db.transaction(async (tx) => {
      await saveYSchemaCompositionSnapshot(tx, {
        snapshot_id: `uploaded_${projectId}_${hash.slice(7)}`,
        project_id: projectId,
        composition_id: compositionId,
        composition_revision: 1,
        composition_hash: hash,
        compiled_schema_hash: hash,
        compiler_version: 'initial-schema@1',
        manifest_json: { filename: input.filename },
        schema_json: { ...schema },
        render_plan_json: [],
        origins_json: {},
      });
      return upsertWorkspaceDraft(
        tx,
        {
          project_id: projectId,
          workspace_id: input.workspaceId,
          title: String(state.title ?? 'Main workspace'),
          target_branch: String(state.targetBranch ?? 'main'),
          parent_commit_hash: null,
          workspace_state: {
            ...state,
            schemaBindings: [
              {
                rootKey: 'candidate',
                canonicalName: compositionId,
                schemaName: input.filename,
                version: '1',
                mode: 'pinned',
                schemaHash: hash,
                compositionId,
                compositionRevision: 1,
                compositionHash: hash,
              },
            ],
          },
        },
        input.ifRevision
      );
    });
    return c.json({ success: true as const, data: { workspaceRevision: saved.revision } }, 200);
  } catch (error) {
    if (error instanceof ConflictError) return errorResponse(c, 'CONFLICT', error.message);
    throw error;
  }
});
