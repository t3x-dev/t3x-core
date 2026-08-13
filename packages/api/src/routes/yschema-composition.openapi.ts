import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ConflictError,
  findWorkspaceDraft,
  listProjectYSchemaVersionHistory,
  listYSchemaArtifactVersions,
  publishYSchemaArtifactVersion,
  saveYSchemaCompositionSnapshot,
  updateYSchemaArtifactIdentity,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import {
  builtInYSchemaModules,
  compileYSchemaComposition,
  compileYSchemaCompositionV2,
  type NodeSchema,
  normalizeYSchemaObject,
  type PublishedYSchemaBlueprintV1,
  sha256CompositionValue,
  type YSchemaCompositionDraft,
  type YSchemaCompositionDraftV2,
  type YSchemaCoreArtifact,
} from '@t3x-dev/yschema';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  artifactViewToManifest,
  ensureBuiltInYSchemaArtifacts,
  resolveCompositionArtifacts,
  resolveCompositionArtifactsV2,
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

const YSchemaCompositionV1Schema = z
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
  .openapi('YSchemaCompositionV1');

const CompositionModuleReferenceV2Schema = ArtifactReferenceSchema.extend({
  presentationOrder: z.number().int().nonnegative(),
});

const YSchemaCompositionV2Schema = z
  .object({
    apiVersion: z.literal('t3x.dev/yschema-composition/v2'),
    id: z.string().min(1),
    revision: z.number().int().nonnegative(),
    status: z.literal('draft'),
    modules: z.array(CompositionModuleReferenceV2Schema),
  })
  .superRefine((composition, context) => {
    const moduleNames = new Set<string>();
    const orders = new Set<number>();
    composition.modules.forEach((module, index) => {
      const identity = `${module.canonicalName}@${module.version}`;
      if (moduleNames.has(identity)) {
        context.addIssue({
          code: 'custom',
          path: ['modules', index, 'canonicalName'],
          message: `Module ${identity} is selected more than once.`,
        });
      }
      moduleNames.add(identity);
      if (orders.has(module.presentationOrder)) {
        context.addIssue({
          code: 'custom',
          path: ['modules', index, 'presentationOrder'],
          message: `Presentation order ${module.presentationOrder} is assigned more than once.`,
        });
      }
      orders.add(module.presentationOrder);
    });
  })
  .openapi('YSchemaCompositionV2');

export const YSchemaCompositionPreviewRequestSchema = z
  .union([YSchemaCompositionV1Schema, YSchemaCompositionV2Schema])
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
    tags: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
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
    policy: z.string().optional(),
    capability: z.string().optional(),
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
      mode: z.enum(['open', 'governed']).optional(),
      issues: z.array(CompositionIssueSchema),
    }),
    compiledSchemaHash: z.string(),
    compositionHash: z.string(),
    reportHash: z.string().optional(),
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

const SchemaIdentityParamsSchema = z.object({
  projectId: z.string().min(1),
  artifactId: z.string().min(1),
});

const UpdateSchemaIdentityRequestSchema = z
  .object({
    if_revision: z.number().int().positive(),
    display_name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  })
  .strict();

const updateSchemaIdentityRoute = createRoute({
  method: 'patch',
  path: '/v1/projects/{projectId}/yschemas/{artifactId}',
  tags: ['YSchema'],
  summary: 'Update mutable Schema identity metadata',
  request: {
    params: SchemaIdentityParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateSchemaIdentityRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated Schema identity without modifying immutable versions',
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Metadata revision conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const setSchemaLifecycleRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/yschemas/{artifactId}/{action}',
  tags: ['YSchema'],
  summary: 'Archive or restore a Schema identity',
  request: {
    params: SchemaIdentityParamsSchema.extend({ action: z.enum(['archive', 'restore']) }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ if_revision: z.number().int().positive() }).strict(),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated Schema lifecycle; immutable versions remain addressable',
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Metadata revision conflict',
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
      data: {
        ...page,
        items: page.items.filter((item) => item.kind !== 'schema').map(artifactViewToManifest),
      },
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
      data: {
        ...page,
        items: page.items.filter((item) => item.kind !== 'schema').map(artifactViewToManifest),
      },
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
  const [legacyItems, schemaItems] = await Promise.all([
    listProjectYSchemaVersionHistory(db, {
      project_id: projectId,
      family,
      kind: 'core',
    }),
    family
      ? Promise.resolve([])
      : listProjectYSchemaVersionHistory(db, {
          project_id: projectId,
          kind: 'schema',
        }),
  ]);
  const items = [...schemaItems, ...legacyItems].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  );
  return c.json(
    { success: true as const, data: { items: items.map(artifactViewToManifest) } },
    200
  );
});

yschemaCompositionRoutes.openapi(updateSchemaIdentityRoute, async (c) => {
  const { projectId, artifactId } = c.req.valid('param');
  const input = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const updated = await updateYSchemaArtifactIdentity(db, {
    artifact_id: artifactId,
    project_id: projectId,
    if_revision: input.if_revision,
    display_name: input.display_name,
    description: input.description,
    tags: input.tags,
  });
  if (!updated) {
    return errorResponse(c, 'CONFLICT', 'Schema metadata changed or the Schema is unavailable.');
  }
  return c.json({ success: true as const, data: artifactViewToManifest(updated) }, 200);
});

yschemaCompositionRoutes.openapi(setSchemaLifecycleRoute, async (c) => {
  const { projectId, artifactId, action } = c.req.valid('param');
  const input = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const updated = await updateYSchemaArtifactIdentity(db, {
    artifact_id: artifactId,
    project_id: projectId,
    if_revision: input.if_revision,
    lifecycle_status: action === 'archive' ? 'archived' : 'active',
  });
  if (!updated) {
    return errorResponse(c, 'CONFLICT', 'Schema metadata changed or the Schema is unavailable.');
  }
  return c.json({ success: true as const, data: artifactViewToManifest(updated) }, 200);
});

yschemaCompositionRoutes.openapi(previewCompositionRoute, async (c) => {
  const composition = c.req.valid('json');
  const db = await getDB();
  if (composition.apiVersion === 't3x.dev/yschema-composition/v2') {
    const modules = await resolveCompositionArtifactsV2(
      db,
      composition as YSchemaCompositionDraftV2
    );
    const result = await compileYSchemaCompositionV2({
      composition: composition as YSchemaCompositionDraftV2,
      modules,
    });
    return c.json({ success: true as const, data: result }, 200);
  }
  const artifacts = await resolveCompositionArtifacts(db, composition);
  const result = await compileYSchemaComposition({
    composition,
    ...artifacts,
  });
  return c.json({ success: true as const, data: result }, 200);
});

yschemaCompositionRoutes.openapi(previewProjectCompositionRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const composition = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  if (composition.apiVersion === 't3x.dev/yschema-composition/v2') {
    const modules = await resolveCompositionArtifactsV2(
      db,
      composition as YSchemaCompositionDraftV2,
      projectId
    );
    const result = await compileYSchemaCompositionV2({
      composition: composition as YSchemaCompositionDraftV2,
      modules,
    });
    return c.json({ success: true as const, data: result }, 200);
  }
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

  const openModules =
    composition.apiVersion === 't3x.dev/yschema-composition/v2'
      ? await resolveCompositionArtifactsV2(db, composition as YSchemaCompositionDraftV2, projectId)
      : undefined;
  const artifacts =
    composition.apiVersion === 't3x.dev/yschema-composition/v1'
      ? await resolveCompositionArtifacts(db, composition as YSchemaCompositionDraft, projectId)
      : undefined;
  const normalized = normalizeComposition(
    composition as YSchemaCompositionDraft | YSchemaCompositionDraftV2,
    expectedCompositionRevision + 1,
    artifacts?.modules
  );
  const preview =
    normalized.apiVersion === 't3x.dev/yschema-composition/v2'
      ? await compileYSchemaCompositionV2({ composition: normalized, modules: openModules ?? [] })
      : await compileYSchemaComposition({
          composition: normalized,
          ...(artifacts as NonNullable<typeof artifacts>),
        });
  const invalidReference = preview.report.issues.find((issue) =>
    ['ARTIFACT_HASH_MISMATCH', 'CORE_INCOMPATIBLE', 'MODULE_NOT_FOUND', 'SLOT_NOT_FOUND'].includes(
      issue.code
    )
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
  if (persisted.composition.apiVersion === 't3x.dev/yschema-composition/v2') {
    if (persisted.composition.revision !== input.composition_revision) {
      return errorResponse(
        c,
        'CONFLICT',
        `Composition revision conflict: expected ${persisted.composition.revision}, received ${input.composition_revision}.`,
        { expectedRevision: persisted.composition.revision }
      );
    }
    const modules = await resolveCompositionArtifactsV2(db, persisted.composition, projectId);
    const preview = await compileYSchemaCompositionV2({
      composition: persisted.composition,
      modules,
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
    const modulesByIdentity = new Map(
      modules.map((module) => [`${module.canonicalName}@${module.version}`, module])
    );
    const pinnedModules = await Promise.all(
      persisted.composition.modules.map(async (reference) => {
        const module = modulesByIdentity.get(`${reference.canonicalName}@${reference.version}`);
        if (!module) throw new Error(`Resolved Module is missing: ${reference.canonicalName}`);
        return {
          ...reference,
          hash: reference.hash ?? (await sha256CompositionValue(module)),
        };
      })
    );
    const schema = normalizeYSchemaObject({
      ...preview.schema,
      name: input.canonical_name,
      version: input.version,
      description: input.description || preview.schema.description,
    });
    const schemaHash = await sha256CompositionValue(schema);
    const manifest: PublishedYSchemaBlueprintV1 = {
      apiVersion: 't3x.dev/yschema-blueprint/v1',
      canonicalName: input.canonical_name,
      version: input.version,
      title: input.title,
      description: input.description || `Published from ${persisted.composition.id}.`,
      status: 'active',
      source: 'team',
      tags: Array.from(new Set(input.tags ?? [])).sort(),
      blueprint: {
        compositionApiVersion: persisted.composition.apiVersion,
        compositionId: persisted.composition.id,
        compositionRevision: persisted.composition.revision,
        modules: pinnedModules,
      },
      schema,
      registry: {
        origin: 'composition',
        compilerVersion: 'yschema-v2',
        compositionHash: preview.compositionHash,
        compiledSchemaHash: preview.compiledSchemaHash,
        reportHash: preview.reportHash,
        schemaHash,
        renderPlan: preview.renderPlan,
        originsByPath: preview.originsByPath,
        releaseNotes: input.release_notes ?? '',
      },
    };
    const artifactHash = await sha256CompositionValue(manifest);
    try {
      const published = await publishYSchemaArtifactVersion(db, {
        artifact_id: yschemaArtifactId(input.canonical_name),
        artifact_version_id: yschemaArtifactVersionId(input.canonical_name, input.version),
        canonical_name: input.canonical_name,
        family: 'open',
        kind: 'schema',
        display_name: input.title,
        description: input.description ?? '',
        tags: input.tags ?? [],
        owner_project_id: projectId,
        visibility: 'private',
        version: input.version,
        status: 'active',
        manifest_json: manifest as unknown as Record<string, unknown>,
        artifact_hash: artifactHash,
        path_count: countSchemaNodePaths(schema.nodes),
        created_by: `project:${projectId}`,
        provides: [],
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
      display_name: input.title,
      description: input.description ?? '',
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

  const openModules =
    persisted.composition.apiVersion === 't3x.dev/yschema-composition/v2'
      ? await resolveCompositionArtifactsV2(db, persisted.composition, projectId)
      : undefined;
  const artifacts =
    persisted.composition.apiVersion === 't3x.dev/yschema-composition/v1'
      ? await resolveCompositionArtifacts(db, persisted.composition, projectId)
      : undefined;
  const preview =
    persisted.composition.apiVersion === 't3x.dev/yschema-composition/v2'
      ? await compileYSchemaCompositionV2({
          composition: persisted.composition,
          modules: openModules ?? [],
        })
      : await compileYSchemaComposition({
          composition: persisted.composition,
          ...(artifacts as NonNullable<typeof artifacts>),
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
    canonicalName:
      persisted.composition.apiVersion === 't3x.dev/yschema-composition/v2'
        ? persisted.composition.id
        : `t3x/${persisted.composition.family}`,
    schemaName:
      persisted.composition.apiVersion === 't3x.dev/yschema-composition/v2'
        ? 'Open Module Composition'
        : `${artifacts?.core.title} Composition`,
    version:
      preview.schema.version ??
      (persisted.composition.apiVersion === 't3x.dev/yschema-composition/v2'
        ? `r${persisted.composition.revision}`
        : (artifacts?.core.version ?? '1.0.0')),
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
    compiler_version:
      persisted.composition.apiVersion === 't3x.dev/yschema-composition/v2'
        ? 'yschema-composition@2'
        : 'yschema-composition@1',
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
):
  | { ok: true; composition: YSchemaCompositionDraft | YSchemaCompositionDraftV2 | null }
  | { ok: false; issues: string[] } {
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
  return {
    ok: true,
    composition: parsed.data as YSchemaCompositionDraft | YSchemaCompositionDraftV2,
  };
}

function normalizeComposition(
  composition: YSchemaCompositionDraft | YSchemaCompositionDraftV2,
  revision: number,
  availableModules = builtInYSchemaModules
): YSchemaCompositionDraft | YSchemaCompositionDraftV2 {
  if (composition.apiVersion === 't3x.dev/yschema-composition/v2') {
    return {
      ...composition,
      revision,
      modules: [...composition.modules]
        .sort(
          (left, right) =>
            left.presentationOrder - right.presentationOrder ||
            left.canonicalName.localeCompare(right.canonicalName)
        )
        .map((reference, index) => ({ ...reference, presentationOrder: (index + 1) * 10 })),
    };
  }
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
