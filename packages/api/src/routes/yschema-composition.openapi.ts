import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ConflictError,
  findWorkspaceDraft,
  listProjectYSchemaVersionHistory,
  listYSchemaArtifactVersions,
  publishYSchemaArtifactVersion,
  saveYSchemaCompositionSnapshot,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import {
  builtInYSchemaModules,
  compileYSchemaComposition,
  type NodeSchema,
  normalizeYSchemaObject,
  sha256CompositionValue,
  type YSchemaCompositionDraft,
  type YSchemaCoreArtifact,
} from '@t3x-dev/yschema';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  artifactViewToManifest,
  ensureBuiltInYSchemaArtifacts,
  resolveCompositionArtifacts,
} from '../lib/yschema-artifact-registry';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const ArtifactReferenceSchema = z.object({
  canonicalName: z.string().min(1),
  version: z.string().min(1),
  hash: z.string().optional(),
});

const CompositionModuleReferenceSchema = ArtifactReferenceSchema.extend({
  order: z.number().int().positive(),
  slot: z.string().min(1).optional(),
});

const YSchemaFamilySchema = z.enum(['esphome-device', 'prd', 'prompt', 'skill']);

export const YSchemaCompositionPreviewRequestSchema = z
  .object({
    apiVersion: z.literal('t3x.dev/yschema-composition/v1'),
    id: z.string().min(1),
    revision: z.number().int().nonnegative(),
    family: YSchemaFamilySchema,
    status: z.literal('draft'),
    core: ArtifactReferenceSchema,
    modules: z.array(CompositionModuleReferenceSchema),
  })
  .superRefine((composition, context) => {
    const moduleNames = new Set<string>();
    const orders = new Set<number>();
    composition.modules.forEach((module, index) => {
      if (moduleNames.has(module.canonicalName)) {
        context.addIssue({
          code: 'custom',
          path: ['modules', index, 'canonicalName'],
          message: `Module ${module.canonicalName} is selected more than once.`,
        });
      }
      moduleNames.add(module.canonicalName);
      if (orders.has(module.order)) {
        context.addIssue({
          code: 'custom',
          path: ['modules', index, 'order'],
          message: `Order ${module.order} is assigned more than once.`,
        });
      }
      orders.add(module.order);
    });
  })
  .openapi('YSchemaCompositionPreviewRequest');

const WorkspaceCompositionParamsSchema = z.object({
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
});

const ArtifactRegistryQuerySchema = z.object({
  family: YSchemaFamilySchema.optional(),
  kind: z.enum(['core', 'module']).optional(),
  visibility: z.enum(['official', 'team', 'community', 'private']).optional(),
  search: z.string().max(120).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

const SaveWorkspaceCompositionRequestSchema = z
  .object({
    composition: YSchemaCompositionPreviewRequestSchema,
    if_revision: z.number().int().min(1),
  })
  .strict()
  .openapi('SaveWorkspaceYSchemaCompositionRequest');

const ApplyWorkspaceCompositionRequestSchema = z
  .object({
    if_revision: z.number().int().min(1),
    composition_revision: z.number().int().positive(),
    composition_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
  .openapi('ApplyWorkspaceYSchemaCompositionRequest');

const PublishWorkspaceCompositionRequestSchema = z
  .object({
    composition_revision: z.number().int().positive(),
    composition_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    canonical_name: z
      .string()
      .min(3)
      .max(160)
      .regex(/^[a-z0-9][a-z0-9._/-]*[a-z0-9]$/),
    version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    release_notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .openapi('PublishWorkspaceYSchemaCompositionRequest');

const CompositionIssueSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    blocking: z.boolean(),
    module: z.string().optional(),
    path: z.string().optional(),
    details: z.record(z.string(), z.any()).optional(),
  })
  .openapi('YSchemaCompositionIssue');

const CompositionPreviewResponseSchema = z
  .object({
    schema: z.any(),
    renderPlan: z.array(
      z.object({
        artifact: z.string(),
        version: z.string(),
        order: z.number().int().nonnegative(),
        slot: z.string(),
        nodePaths: z.array(z.string()),
      })
    ),
    originsByPath: z.record(
      z.string(),
      z.object({
        artifact: z.string(),
        version: z.string(),
        kind: z.enum(['core', 'module']),
      })
    ),
    report: z.object({
      valid: z.boolean(),
      issues: z.array(CompositionIssueSchema),
    }),
    compiledSchemaHash: z.string(),
    compositionHash: z.string(),
  })
  .openapi('YSchemaCompositionPreviewResponse');

const WorkspaceCompositionResponseSchema = z
  .object({
    composition: YSchemaCompositionPreviewRequestSchema.nullable(),
    workspaceRevision: z.number().int().min(1),
    preview: CompositionPreviewResponseSchema.optional(),
    binding: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('WorkspaceYSchemaCompositionResponse');

const ArtifactRegistryResponseSchema = z
  .object({
    items: z.array(z.any()),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  })
  .openapi('YSchemaArtifactRegistryResponse');

const ProjectYSchemaVersionHistoryResponseSchema = z
  .object({ items: z.array(z.any()) })
  .openapi('ProjectYSchemaVersionHistoryResponse');

const listArtifactsRoute = createRoute({
  method: 'get',
  path: '/v1/yschema/artifacts',
  tags: ['YSchema'],
  summary: 'List built-in YSchema Core and Module artifacts',
  request: { query: ArtifactRegistryQuerySchema },
  responses: {
    200: {
      description: 'Built-in artifacts available to the composition preview',
      content: {
        'application/json': { schema: SuccessResponseSchema(ArtifactRegistryResponseSchema) },
      },
    },
  },
});

const listProjectArtifactsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/yschema/artifacts',
  tags: ['YSchema'],
  summary: 'List visible YSchema Registry artifacts for a project',
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    query: ArtifactRegistryQuerySchema,
  },
  responses: {
    200: {
      description: 'Paginated official, community, team, and private Artifacts visible to project',
      content: {
        'application/json': { schema: SuccessResponseSchema(ArtifactRegistryResponseSchema) },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const listProjectVersionsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/yschema/versions',
  tags: ['YSchema'],
  summary: 'List immutable YSchema versions published by a project',
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    query: z.object({ family: YSchemaFamilySchema.optional() }),
  },
  responses: {
    200: {
      description: 'Project-owned Schema version history, newest first',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ProjectYSchemaVersionHistoryResponseSchema),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const previewCompositionRoute = createRoute({
  method: 'post',
  path: '/v1/yschema/compositions/preview',
  tags: ['YSchema'],
  summary: 'Deterministically compile a YSchema Composition draft',
  request: {
    body: {
      required: true,
      content: {
        'application/json': { schema: YSchemaCompositionPreviewRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Compiled schema preview and deterministic verification report',
      content: {
        'application/json': { schema: SuccessResponseSchema(CompositionPreviewResponseSchema) },
      },
    },
  },
});

const previewProjectCompositionRoute = createRoute({
  ...previewCompositionRoute,
  path: '/v1/projects/{projectId}/yschema/compositions/preview',
  summary: 'Compile a Composition using Artifacts visible to a project',
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    body: previewCompositionRoute.request.body,
  },
});

const getWorkspaceCompositionRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/schema-composition',
  tags: ['YSchema'],
  summary: 'Read a Workspace YSchema Composition draft',
  request: { params: WorkspaceCompositionParamsSchema },
  responses: {
    200: {
      description: 'Persisted Composition draft and Workspace revision',
      content: {
        'application/json': { schema: SuccessResponseSchema(WorkspaceCompositionResponseSchema) },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Persisted Composition is corrupt',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const saveWorkspaceCompositionRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/schema-composition',
  tags: ['YSchema'],
  summary: 'Save a Workspace YSchema Composition draft',
  request: {
    params: WorkspaceCompositionParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: SaveWorkspaceCompositionRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Saved normalized Composition draft; no Commit is created',
      content: {
        'application/json': { schema: SuccessResponseSchema(WorkspaceCompositionResponseSchema) },
      },
    },
    400: {
      description: 'Composition contains an unavailable Core, Module, or slot reference',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Workspace or Composition revision conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Persisted Composition is corrupt',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const applyWorkspaceCompositionRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/schema-composition/apply',
  tags: ['YSchema'],
  summary: 'Apply a verified YSchema Composition to a Workspace',
  request: {
    params: WorkspaceCompositionParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: ApplyWorkspaceCompositionRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Composition bound to Workspace; stale Candidate and YOps proposals cleared',
      content: {
        'application/json': { schema: SuccessResponseSchema(WorkspaceCompositionResponseSchema) },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace or Composition not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Workspace revision, Composition revision, or preview hash conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const publishWorkspaceCompositionRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/schema-composition/publish',
  tags: ['YSchema'],
  summary: 'Publish a saved Composition as an immutable project Schema version',
  request: {
    params: WorkspaceCompositionParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: PublishWorkspaceCompositionRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Published immutable Schema version',
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace or Composition not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Composition hash or immutable version conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const yschemaCompositionRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

yschemaCompositionRoutes.openapi(listArtifactsRoute, async (c) => {
  const query = c.req.valid('query');
  const db = await getDB();
  await ensureBuiltInYSchemaArtifacts(db);
  const page = await listYSchemaArtifactVersions(db, {
    ...query,
    cursor: query.cursor ?? '',
  });
  return c.json(
    {
      success: true as const,
      data: { ...page, items: page.items.map(artifactViewToManifest) },
    },
    200
  );
});

yschemaCompositionRoutes.openapi(listProjectArtifactsRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const query = c.req.valid('query');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  await ensureBuiltInYSchemaArtifacts(db);
  const page = await listYSchemaArtifactVersions(db, {
    ...query,
    project_id: projectId,
    cursor: query.cursor ?? '',
  });
  return c.json(
    {
      success: true as const,
      data: { ...page, items: page.items.map(artifactViewToManifest) },
    },
    200
  );
});

yschemaCompositionRoutes.openapi(listProjectVersionsRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { family } = c.req.valid('query');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const items = await listProjectYSchemaVersionHistory(db, {
    project_id: projectId,
    family,
    kind: 'core',
  });
  return c.json(
    { success: true as const, data: { items: items.map(artifactViewToManifest) } },
    200
  );
});

yschemaCompositionRoutes.openapi(previewCompositionRoute, async (c) => {
  const composition = c.req.valid('json') as YSchemaCompositionDraft;
  const db = await getDB();
  const artifacts = await resolveCompositionArtifacts(db, composition);
  const result = await compileYSchemaComposition({
    composition,
    ...artifacts,
  });
  return c.json({ success: true as const, data: result }, 200);
});

yschemaCompositionRoutes.openapi(previewProjectCompositionRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const composition = c.req.valid('json') as YSchemaCompositionDraft;
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const artifacts = await resolveCompositionArtifacts(db, composition, projectId);
  const result = await compileYSchemaComposition({ composition, ...artifacts });
  return c.json({ success: true as const, data: result }, 200);
});

yschemaCompositionRoutes.openapi(getWorkspaceCompositionRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state) {
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`);
  }

  const parsed = parsePersistedComposition(draft.workspace_state.schemaComposition);
  if (!parsed.ok) {
    return errorResponse(
      c,
      'DATABASE_ERROR',
      `Workspace ${workspaceId} contains an invalid YSchema Composition draft.`,
      { issues: parsed.issues }
    );
  }

  return c.json(
    {
      success: true as const,
      data: {
        composition: parsed.composition,
        workspaceRevision: draft.revision,
      },
    },
    200
  );
});

yschemaCompositionRoutes.openapi(saveWorkspaceCompositionRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { composition, if_revision: ifRevision } = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state) {
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`);
  }

  const current = parsePersistedComposition(draft.workspace_state.schemaComposition);
  if (!current.ok) {
    return errorResponse(
      c,
      'DATABASE_ERROR',
      `Workspace ${workspaceId} contains an invalid YSchema Composition draft.`,
      { issues: current.issues }
    );
  }

  const expectedCompositionRevision = current.composition?.revision ?? 0;
  if (composition.revision !== expectedCompositionRevision) {
    return errorResponse(
      c,
      'CONFLICT',
      `Composition revision conflict: expected ${expectedCompositionRevision}, received ${composition.revision}.`,
      { expectedRevision: expectedCompositionRevision }
    );
  }

  const artifacts = await resolveCompositionArtifacts(db, composition, projectId);
  const normalized = normalizeComposition(
    composition,
    expectedCompositionRevision + 1,
    artifacts.modules
  );
  const preview = await compileYSchemaComposition({
    composition: normalized,
    ...artifacts,
  });
  const invalidReference = preview.report.issues.find((issue) =>
    ['CORE_INCOMPATIBLE', 'MODULE_NOT_FOUND', 'SLOT_NOT_FOUND'].includes(issue.code)
  );
  if (invalidReference) {
    return errorResponse(c, 'VALIDATION_FAILED', invalidReference.message, {
      issueCode: invalidReference.code,
    });
  }

  const savedAt = new Date().toISOString();
  const workspaceState = {
    ...draft.workspace_state,
    schemaComposition: normalized,
    updatedAt: savedAt,
  };

  try {
    const saved = await upsertWorkspaceDraft(
      db,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        title: workspaceString(workspaceState, 'title', workspaceId),
        parent_commit_hash: workspaceNullableString(workspaceState, 'baseCommitHash'),
        target_branch: workspaceString(workspaceState, 'targetBranch', 'main'),
        workspace_state: workspaceState,
      },
      ifRevision
    );
    return c.json(
      {
        success: true as const,
        data: {
          composition: normalized,
          workspaceRevision: saved.revision,
          preview,
        },
      },
      200
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      return errorResponse(c, 'CONFLICT', error.message, { expectedRevision: ifRevision });
    }
    throw error;
  }
});

yschemaCompositionRoutes.openapi(publishWorkspaceCompositionRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const input = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state) {
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`);
  }
  const persisted = parsePersistedComposition(draft.workspace_state.schemaComposition);
  if (!persisted.ok) {
    return errorResponse(
      c,
      'DATABASE_ERROR',
      `Workspace ${workspaceId} contains an invalid YSchema Composition draft.`,
      { issues: persisted.issues }
    );
  }
  if (!persisted.composition) {
    return errorResponse(c, 'NOT_FOUND', `Workspace ${workspaceId} has no saved Composition.`);
  }
  if (persisted.composition.revision !== input.composition_revision) {
    return errorResponse(
      c,
      'CONFLICT',
      `Composition revision conflict: expected ${persisted.composition.revision}, received ${input.composition_revision}.`,
      { expectedRevision: persisted.composition.revision }
    );
  }

  const artifacts = await resolveCompositionArtifacts(db, persisted.composition, projectId);
  const preview = await compileYSchemaComposition({
    composition: persisted.composition,
    ...artifacts,
  });
  if (preview.compositionHash !== input.composition_hash) {
    return errorResponse(
      c,
      'CONFLICT',
      'Composition preview is stale. Compile the saved revision again before publishing it.',
      { expectedCompositionHash: preview.compositionHash }
    );
  }
  if (!preview.report.valid) {
    return errorResponse(
      c,
      'REVIEW_REQUIRED',
      'Composition has blocking verification issues and cannot be published.',
      { issues: preview.report.issues }
    );
  }

  const schema = normalizeYSchemaObject({
    ...preview.schema,
    name: input.canonical_name,
    version: input.version,
    description: input.description || preview.schema.description,
  });
  const schemaHash = await sha256CompositionValue(schema);
  const provides = Array.from(
    new Set([...artifacts.core.provides, ...artifacts.modules.flatMap((module) => module.provides)])
  ).sort();
  const manifest: YSchemaCoreArtifact & { registry: Record<string, unknown> } = {
    apiVersion: 't3x.dev/yschema-core/v1',
    canonicalName: input.canonical_name,
    version: input.version,
    family: persisted.composition.family,
    title: input.title,
    description: input.description || `Published from ${persisted.composition.id}.`,
    status: 'active',
    source: 'team',
    provides,
    extensionSlots: artifacts.core.extensionSlots,
    render: artifacts.core.render,
    schema,
    registry: {
      origin: 'composition',
      compositionId: persisted.composition.id,
      compositionRevision: persisted.composition.revision,
      compositionHash: preview.compositionHash,
      sourceCompiledSchemaHash: preview.compiledSchemaHash,
      schemaHash,
      renderPlan: preview.renderPlan,
      originsByPath: preview.originsByPath,
      modules: persisted.composition.modules,
      releaseNotes: input.release_notes ?? '',
    },
  };
  const artifactHash = await sha256CompositionValue(manifest);

  try {
    const published = await publishYSchemaArtifactVersion(db, {
      artifact_id: yschemaArtifactId(input.canonical_name),
      artifact_version_id: yschemaArtifactVersionId(input.canonical_name, input.version),
      canonical_name: input.canonical_name,
      family: persisted.composition.family,
      kind: 'core',
      owner_project_id: projectId,
      visibility: 'private',
      version: input.version,
      status: 'active',
      manifest_json: manifest as unknown as Record<string, unknown>,
      artifact_hash: artifactHash,
      path_count: countSchemaNodePaths(schema.nodes),
      created_by: `project:${projectId}`,
      provides,
      requires: [],
    });
    return c.json({ success: true as const, data: artifactViewToManifest(published) }, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Schema version could not be published.';
    if (message.includes('immutable') || message.includes('identity conflict')) {
      return errorResponse(c, 'CONFLICT', message);
    }
    throw error;
  }
});

yschemaCompositionRoutes.openapi(applyWorkspaceCompositionRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const {
    if_revision: ifRevision,
    composition_revision: compositionRevision,
    composition_hash: expectedCompositionHash,
  } = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state) {
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`);
  }

  const persisted = parsePersistedComposition(draft.workspace_state.schemaComposition);
  if (!persisted.ok) {
    return errorResponse(
      c,
      'DATABASE_ERROR',
      `Workspace ${workspaceId} contains an invalid YSchema Composition draft.`,
      { issues: persisted.issues }
    );
  }
  if (!persisted.composition) {
    return errorResponse(c, 'NOT_FOUND', `Workspace ${workspaceId} has no saved Composition.`);
  }
  if (persisted.composition.revision !== compositionRevision) {
    return errorResponse(
      c,
      'CONFLICT',
      `Composition revision conflict: expected ${persisted.composition.revision}, received ${compositionRevision}.`,
      { expectedRevision: persisted.composition.revision }
    );
  }

  const artifacts = await resolveCompositionArtifacts(db, persisted.composition, projectId);
  const preview = await compileYSchemaComposition({
    composition: persisted.composition,
    ...artifacts,
  });
  if (preview.compositionHash !== expectedCompositionHash) {
    return errorResponse(
      c,
      'CONFLICT',
      'Composition preview is stale. Compile the saved revision again before applying it.',
      { expectedCompositionHash: preview.compositionHash }
    );
  }
  if (!preview.report.valid) {
    return errorResponse(
      c,
      'REVIEW_REQUIRED',
      'Composition has blocking verification issues and cannot be applied.',
      { issues: preview.report.issues }
    );
  }

  const binding = {
    canonicalName: `t3x/${persisted.composition.family}`,
    schemaName: `${artifacts.core.title} Composition`,
    version: preview.schema.version ?? artifacts.core.version,
    mode: 'draft_override',
    schemaHash: preview.compiledSchemaHash,
    compositionId: persisted.composition.id,
    compositionRevision: persisted.composition.revision,
    compositionHash: preview.compositionHash,
  };
  await saveYSchemaCompositionSnapshot(db, {
    snapshot_id: `yscs_${preview.compositionHash.slice('sha256:'.length)}`,
    project_id: projectId,
    composition_id: persisted.composition.id,
    composition_revision: persisted.composition.revision,
    composition_hash: preview.compositionHash,
    compiled_schema_hash: preview.compiledSchemaHash,
    compiler_version: 'yschema-composition@1',
    manifest_json: persisted.composition as unknown as Record<string, unknown>,
    schema_json: preview.schema as unknown as Record<string, unknown>,
    render_plan_json: preview.renderPlan,
    origins_json: preview.originsByPath,
  });
  const appliedAt = new Date().toISOString();
  const previousYOps = asRecord(draft.workspace_state.yopsDraft);
  const { commitOverride: _commitOverride, ...workspaceWithoutOverride } = draft.workspace_state;
  const workspaceState = {
    ...workspaceWithoutOverride,
    status: 'draft',
    schemaBindings: [binding],
    schemaCandidate: {
      summary: `YSchema Composition r${persisted.composition.revision} was applied. Regenerate the candidate from its sources.`,
      fields: [],
    },
    schemaReview: {
      verdict: 'needs_review',
      summary: 'The previous candidate was produced under a different Schema and is now stale.',
      gaps: [`Regenerate the candidate against Composition r${persisted.composition.revision}.`],
    },
    yopsDraft: {
      ...(previousYOps ?? {}),
      id:
        typeof previousYOps?.id === 'string'
          ? previousYOps.id
          : `draft:${workspaceId}:composition-r${persisted.composition.revision}`,
      operations: [],
    },
    updatedAt: appliedAt,
  };

  try {
    const saved = await upsertWorkspaceDraft(
      db,
      {
        project_id: projectId,
        workspace_id: workspaceId,
        title: workspaceString(workspaceState, 'title', workspaceId),
        parent_commit_hash: workspaceNullableString(workspaceState, 'baseCommitHash'),
        target_branch: workspaceString(workspaceState, 'targetBranch', 'main'),
        workspace_state: workspaceState,
      },
      ifRevision
    );
    return c.json(
      {
        success: true as const,
        data: {
          composition: persisted.composition,
          workspaceRevision: saved.revision,
          preview,
          binding,
        },
      },
      200
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      return errorResponse(c, 'CONFLICT', error.message, { expectedRevision: ifRevision });
    }
    throw error;
  }
});

function parsePersistedComposition(
  value: unknown
): { ok: true; composition: YSchemaCompositionDraft | null } | { ok: false; issues: string[] } {
  if (value === undefined || value === null) return { ok: true, composition: null };
  const parsed = YSchemaCompositionPreviewRequestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'composition'}: ${issue.message}`
      ),
    };
  }
  return { ok: true, composition: parsed.data as YSchemaCompositionDraft };
}

function normalizeComposition(
  composition: YSchemaCompositionDraft,
  revision: number,
  availableModules = builtInYSchemaModules
): YSchemaCompositionDraft {
  const moduleByKey = new Map(
    availableModules.map((module) => [`${module.canonicalName}@${module.version}`, module])
  );
  return {
    ...composition,
    revision,
    modules: [...composition.modules]
      .sort(
        (left, right) =>
          left.order - right.order || left.canonicalName.localeCompare(right.canonicalName)
      )
      .map((reference, index) => {
        const manifest = moduleByKey.get(`${reference.canonicalName}@${reference.version}`);
        return {
          ...reference,
          order: (index + 1) * 10,
          ...((reference.slot ?? manifest?.defaultPlacement.slot)
            ? { slot: reference.slot ?? manifest?.defaultPlacement.slot }
            : {}),
        };
      }),
  };
}

function workspaceString(
  workspace: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = workspace[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function workspaceNullableString(workspace: Record<string, unknown>, key: string): string | null {
  const value = workspace[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function yschemaArtifactId(canonicalName: string): string {
  return `ysa_${canonicalName.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

function yschemaArtifactVersionId(canonicalName: string, version: string): string {
  return `${yschemaArtifactId(canonicalName)}_${version.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

function countSchemaNodePaths(nodes: Record<string, NodeSchema>): number {
  let count = 0;
  for (const node of Object.values(nodes)) {
    count += 1 + Object.keys(node.slots ?? {}).length;
    if (node.children && node.children !== 'any') count += countSchemaNodePaths(node.children);
  }
  return count;
}
