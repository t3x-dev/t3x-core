import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { inspectRepositoryName } from '@t3x-dev/application';
import {
  findNamespaceBySlug,
  findRepositoryClaim,
  getRepositoryAddress,
  resolveRepositoryProject,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse } from '../lib/errors';
import { assertNamespaceAccess } from '../lib/namespace-access';
import { assertProjectAccess, assertProjectCreationAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const repositoryPathRoutes = new OpenAPIHono();
const failures = {
  400: {
    description: 'Invalid request',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  403: {
    description: 'Access denied',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Not found',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  500: {
    description: 'Server error',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};

const resolveRoute = createRoute({
  method: 'get',
  path: '/v1/repositories/{owner}/{name}',
  tags: ['Projects'],
  summary: 'Resolve a current or historical repository address with project access checks',
  request: { params: z.object({ owner: z.string().min(1), name: z.string().min(1) }) },
  responses: {
    ...failures,
    200: {
      description: 'Resolved repository',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              project_id: z.string(),
              name: z.string(),
              namespace: z.string().nullable(),
              canonical_path: z.string().nullable(),
              path_status: z.enum(['ready', 'pending_migration']),
              redirect: z.boolean(),
            })
          ),
        },
      },
    },
  },
});
repositoryPathRoutes.openapi(resolveRoute, async (c) => {
  const { owner, name } = c.req.valid('param');
  const db = await getDB();
  const project = await resolveRepositoryProject(db, owner, name);
  if (!project) return errorResponse(c, 'NOT_FOUND', 'Repository not found');
  const access = await assertProjectAccess(c, db, project.projectId, 'project:read');
  if (access instanceof Response) return access;
  const address = await getRepositoryAddress(db, access);
  return c.json(
    {
      success: true as const,
      data: {
        ...address,
        project_id: access.projectId,
        name: access.name,
        redirect: address.canonical_path !== null && address.canonical_path !== `/${owner}/${name}`,
      },
    },
    200
  );
});

const checkRoute = createRoute({
  method: 'get',
  path: '/v1/repository-name',
  tags: ['Projects'],
  summary: 'Normalize and check a proposed name; submission still claims it atomically',
  request: {
    query: z.object({
      namespace: z.string().min(1),
      name: z.string().max(4096),
      project_id: z.string().optional(),
    }),
  },
  responses: {
    ...failures,
    200: {
      description: 'Name validation and advisory availability',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              name: z.string(),
              changed: z.boolean(),
              valid: z.boolean(),
              code: z.string().nullable(),
              message: z.string().nullable(),
              namespace: z.string(),
              canonical_path: z.string().nullable(),
              available: z.boolean(),
            })
          ),
        },
      },
    },
  },
});
repositoryPathRoutes.openapi(checkRoute, async (c) => {
  const query = c.req.valid('query');
  const db = await getDB();
  const namespace = await findNamespaceBySlug(db, query.namespace.toLowerCase());
  if (!namespace) return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
  if (query.project_id) {
    const access = await assertProjectAccess(c, db, query.project_id, 'project:edit');
    if (access instanceof Response) return access;
    if (access.namespaceId !== namespace.namespaceId)
      return errorResponse(c, 'FORBIDDEN', 'Project namespace does not match');
  } else {
    const denied =
      assertProjectCreationAccess(c) ??
      (await assertNamespaceAccess(c, db, namespace, 'project:create'));
    if (denied) return denied;
  }
  const naming = inspectRepositoryName(query.name);
  const claim = naming.valid
    ? await findRepositoryClaim(db, namespace.namespaceId, naming.name)
    : null;
  const available =
    naming.valid &&
    (!claim || (query.project_id !== undefined && claim.projectId === query.project_id));
  return c.json(
    {
      success: true as const,
      data: {
        ...naming,
        namespace: namespace.slug,
        available,
        canonical_path: naming.valid ? `/${namespace.slug}/${naming.name}` : null,
        code: naming.code ?? (available ? null : 'NAME_OCCUPIED'),
        message:
          naming.message ??
          (available ? null : 'This repository name is already occupied in this namespace.'),
      },
    },
    200
  );
});
