import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  findNamespaceBySlug,
  findPersonalNamespaceByOwner,
  insertPersonalNamespace,
  type Namespace,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse } from '../lib/errors';
import { assertProjectCreationAccess, getUserId } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { CreateNamespaceSchema, NamespaceSchema, NamespaceSlugSchema } from '../schemas/namespaces';

export const namespaceRoutes = new OpenAPIHono();

const RESERVED_SLUGS = new Set([
  'api',
  'chat',
  'deploy',
  'login',
  'new',
  'onboarding',
  'project',
  'settings',
  'share',
  't3x-dev',
  'templates',
]);

function toApiNamespace(namespace: Namespace) {
  return {
    namespace_id: namespace.namespaceId,
    slug: namespace.slug,
    kind: namespace.kind as 'personal' | 'organization',
    display_name: namespace.displayName,
    created_at: namespace.createdAt.toISOString(),
  };
}

const createNamespaceRoute = createRoute({
  method: 'post',
  path: '/v1/namespaces',
  tags: ['Namespaces'],
  summary: 'Create the current user personal namespace',
  request: {
    body: { content: { 'application/json': { schema: CreateNamespaceSchema } } },
  },
  responses: {
    201: {
      description: 'Personal namespace created',
      content: { 'application/json': { schema: SuccessResponseSchema(NamespaceSchema) } },
    },
    200: {
      description: 'Existing personal namespace returned',
      content: { 'application/json': { schema: SuccessResponseSchema(NamespaceSchema) } },
    },
    400: {
      description: 'Reserved namespace',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Namespace creation is not allowed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Namespace is already taken',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

namespaceRoutes.openapi(createNamespaceRoute, async (c) => {
  const denied = assertProjectCreationAccess(c);
  if (denied) return denied;

  const { slug } = c.req.valid('json');
  if (RESERVED_SLUGS.has(slug)) {
    return errorResponse(c, 'INVALID_REQUEST', 'This namespace is reserved');
  }

  try {
    const db = await getDB();
    const userId = getUserId(c);
    if (userId) {
      const personal = await findPersonalNamespaceByOwner(db, userId);
      if (personal) {
        if (personal.slug === slug) {
          return c.json({ success: true as const, data: toApiNamespace(personal) }, 200);
        }
        return errorResponse(c, 'HASH_CONFLICT', 'This account already has a personal namespace', {
          namespace: personal.slug,
        });
      }
    }

    const existing = await findNamespaceBySlug(db, slug);
    if (existing) {
      if (existing.kind === 'personal' && existing.ownerUserId === (userId ?? null)) {
        return c.json({ success: true as const, data: toApiNamespace(existing) }, 200);
      }
      return errorResponse(c, 'HASH_CONFLICT', 'This namespace is already taken');
    }

    const namespace = await insertPersonalNamespace(db, { slug, ownerUserId: userId });
    return c.json({ success: true as const, data: toApiNamespace(namespace) }, 201);
  } catch (err) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '23505') {
      return errorResponse(c, 'HASH_CONFLICT', 'This namespace is already taken');
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

const getNamespaceRoute = createRoute({
  method: 'get',
  path: '/v1/namespaces/{slug}',
  tags: ['Namespaces'],
  summary: 'Get a namespace public profile',
  request: { params: z.object({ slug: NamespaceSlugSchema }) },
  responses: {
    200: {
      description: 'Namespace profile',
      content: { 'application/json': { schema: SuccessResponseSchema(NamespaceSchema) } },
    },
    404: {
      description: 'Namespace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const getCurrentNamespaceRoute = createRoute({
  method: 'get',
  path: '/v1/namespaces/me',
  tags: ['Namespaces'],
  summary: 'Get the current user personal namespace',
  responses: {
    200: {
      description: 'Current personal namespace',
      content: { 'application/json': { schema: SuccessResponseSchema(NamespaceSchema) } },
    },
    401: {
      description: 'Authentication required',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Personal namespace not created yet',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// Register /me before /{slug} so it cannot be interpreted as a public slug.
namespaceRoutes.openapi(getCurrentNamespaceRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return errorResponse(c, 'UNAUTHORIZED', 'Authentication required');
  }

  try {
    const namespace = await findPersonalNamespaceByOwner(await getDB(), userId);
    if (!namespace) {
      return errorResponse(c, 'NOT_FOUND', 'Personal namespace not created yet');
    }
    return c.json({ success: true as const, data: toApiNamespace(namespace) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

namespaceRoutes.openapi(getNamespaceRoute, async (c) => {
  try {
    const namespace = await findNamespaceBySlug(await getDB(), c.req.valid('param').slug);
    if (!namespace) {
      return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
    }
    return c.json({ success: true as const, data: toApiNamespace(namespace) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});
