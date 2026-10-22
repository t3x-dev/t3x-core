import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ExploreSchemaReleaseSchema,
  PublicProjectDetailSchema,
  PublicProjectPageSchema,
  SchemaTargetPageSchema,
} from '@t3x-dev/api-client';
import {
  decodeCursor,
  findProjectById,
  findProjects,
  getRepositoryAddress,
  listYSchemaCatalogReleases,
} from '@t3x-dev/storage';
import { isAuthenticationDisabled } from '../lib/auth-config';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  assertProjectAccess,
  evaluateProjectAccess,
  getProjectAccessPrincipal,
  getProjectListAuthority,
} from '../lib/project-access';
import { projectMetadataFields } from '../lib/repository-profile';
import { resolveStudioSource } from '../lib/schema-studio';
import { ensureBuiltInYSchemaArtifacts } from '../lib/yschema-artifact-registry';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const exploreRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
const pageQuery = z.object({
  cursor: z
    .string()
    .max(2048)
    .default('')
    .refine((value) => {
      if (!value) return true;
      try {
        decodeCursor(value);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid cursor'),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  q: z.string().trim().max(200).optional(),
});
const errors = {
  400: {
    description: 'Invalid request',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  403: {
    description: 'Access denied',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Unavailable or no longer authorized',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};
const publicProjectsRoute = createRoute({
  method: 'get',
  path: '/v1/explore/projects',
  tags: ['Explore'],
  summary: 'Browse public repository introductions without granting project access',
  request: { query: pageQuery.extend({ tag: z.string().trim().max(64).optional() }).strict() },
  responses: {
    ...errors,
    200: {
      description: 'Public repository cards',
      content: { 'application/json': { schema: SuccessResponseSchema(PublicProjectPageSchema) } },
    },
  },
});
const publicProjectRoute = createRoute({
  method: 'get',
  path: '/v1/explore/projects/{projectId}',
  tags: ['Explore'],
  summary: 'Read a public repository introduction, not its State or private metadata',
  request: { params: z.object({ projectId: z.string().min(1) }) },
  responses: {
    ...errors,
    200: {
      description: 'Public repository introduction',
      content: { 'application/json': { schema: SuccessResponseSchema(PublicProjectDetailSchema) } },
    },
  },
});
const schemaTargetsRoute = createRoute({
  method: 'get',
  path: '/v1/explore/schema-targets',
  tags: ['Explore'],
  summary: 'Find editable projects for explicit Schema Studio destination selection',
  request: { query: pageQuery.strict() },
  responses: {
    ...errors,
    200: {
      description: 'Editable targets',
      content: { 'application/json': { schema: SuccessResponseSchema(SchemaTargetPageSchema) } },
    },
  },
});
const schemaReleaseRoute = createRoute({
  method: 'get',
  path: '/v1/explore/schema-release',
  tags: ['Explore'],
  summary: 'Read an exact authorized release without a destination project',
  request: {
    query: z
      .object({
        canonicalName: z.string().min(1).max(200),
        version: z
          .string()
          .min(1)
          .max(100)
          .refine((value) => value !== 'latest', 'An exact version is required'),
        expectedHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
        sourceProjectId: z.string().min(1).optional(),
        catalogProjectId: z.string().min(1).optional(),
      })
      .strict(),
  },
  responses: {
    ...errors,
    200: {
      description: 'Integrity-verified published release',
      content: {
        'application/json': { schema: SuccessResponseSchema(ExploreSchemaReleaseSchema) },
      },
    },
  },
});

async function publicCard(
  c: Parameters<typeof getProjectAccessPrincipal>[0],
  db: Awaited<ReturnType<typeof getDB>>,
  project: NonNullable<Awaited<ReturnType<typeof findProjectById>>>
) {
  const address = await getRepositoryAddress(db, project);
  const { metadata, repository_profile } = projectMetadataFields(project.metadataJson);
  const access = await evaluateProjectAccess(
    db,
    project.projectId,
    getProjectAccessPrincipal(c),
    'project:read',
    { allowLocalBypass: isAuthenticationDisabled() }
  );
  return {
    projectId: project.projectId,
    name: project.name,
    namespace: address.namespace,
    description:
      typeof metadata?.description === 'string' ? metadata.description.slice(0, 4096) : '',
    tags: repository_profile.tags,
    createdAt: project.createdAt.toISOString(),
    repositoryPath: access.allowed ? `/project/${encodeURIComponent(project.projectId)}` : null,
  };
}
exploreRoutes.openapi(publicProjectsRoute, async (c) => {
  const db = await getDB();
  const page = await findProjects(db, { ...c.req.valid('query'), visibility: 'public' });
  const items = await Promise.all(page.items.map((project) => publicCard(c, db, project)));
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    { success: true as const, data: PublicProjectPageSchema.parse({ ...page, items }) },
    200
  );
});
exploreRoutes.openapi(publicProjectRoute, async (c) => {
  const db = await getDB();
  const project = await findProjectById(db, c.req.valid('param').projectId);
  c.header('Cache-Control', 'private, no-store');
  if (!project || project.visibility !== 'public')
    return errorResponse(c, 'NOT_FOUND', 'Public project unavailable');
  const card = await publicCard(c, db, project);
  const { repository_profile } = projectMetadataFields(project.metadataJson);
  return c.json(
    {
      success: true as const,
      data: PublicProjectDetailSchema.parse({ ...card, readme: repository_profile.readme }),
    },
    200
  );
});
exploreRoutes.openapi(schemaTargetsRoute, async (c) => {
  const db = await getDB();
  const authority = getProjectListAuthority(c);
  if (!authority && !isAuthenticationDisabled())
    return errorResponse(c, 'FORBIDDEN', 'Project access denied');
  const page = await findProjects(db, {
    ...c.req.valid('query'),
    authority,
    required_action: 'project:edit',
  });
  // Re-evaluate canonical authority as well as the SQL capability predicate.
  const targets = await Promise.all(
    page.items.map(async (project) => {
      const access = await evaluateProjectAccess(
        db,
        project.projectId,
        getProjectAccessPrincipal(c),
        'project:edit',
        { allowLocalBypass: isAuthenticationDisabled() }
      );
      if (!access.allowed) return null;
      const address = await getRepositoryAddress(db, project);
      return { projectId: project.projectId, name: project.name, namespace: address.namespace };
    })
  );
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      success: true as const,
      data: SchemaTargetPageSchema.parse({
        ...page,
        items: targets.filter((item) => item !== null),
      }),
    },
    200
  );
});
exploreRoutes.openapi(schemaReleaseRoute, async (c) => {
  const query = c.req.valid('query');
  const db = await getDB();
  await ensureBuiltInYSchemaArtifacts(db);
  c.header('Cache-Control', 'private, no-store');
  const catalogProject = query.sourceProjectId ?? query.catalogProjectId;
  if (catalogProject) {
    const access = await assertProjectAccess(c, db, catalogProject, 'project:read');
    if (access instanceof Response)
      return errorResponse(c, 'NOT_FOUND', 'Release unavailable or no longer authorized');
  }
  const page = await listYSchemaCatalogReleases(db, {
    project_id: catalogProject,
    canonical_name: query.canonicalName,
    exact_version: query.version,
    exact_hash: query.expectedHash,
    limit: 1,
  });
  const item = page.items[0];
  if (!item || (query.sourceProjectId && item.identity.ownerProjectId !== query.sourceProjectId))
    return errorResponse(c, 'NOT_FOUND', 'Release unavailable');
  const view = await resolveStudioSource(c, db, {
    sourceProjectId: item.identity.ownerProjectId,
    canonicalName: query.canonicalName,
    version: query.version,
    artifactHash: query.expectedHash,
  });
  if (!view)
    return errorResponse(c, 'NOT_FOUND', 'This release is unavailable or no longer authorized.');
  return c.json(
    {
      success: true as const,
      data: ExploreSchemaReleaseSchema.parse({
        item,
        artifactHash: view.artifactHash,
        readme: typeof view.manifest.readme === 'string' ? view.manifest.readme : null,
        manifest: view.manifest,
      }),
    },
    200
  );
});
