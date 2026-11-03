/**
 * API Key Routes with OpenAPI
 *
 * Endpoints:
 * - POST   /v1/api-keys   - Create a new API key
 * - GET    /v1/api-keys   - List API keys
 * - DELETE /v1/api-keys/:id - Revoke an API key
 */

import { randomBytes } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { API_KEY_VALUE_PREFIX, type ApiKey } from '@t3x-dev/core';
import {
  createApiKey,
  findApiKeyById,
  findNamespaceById,
  listApiKeys,
  revokeApiKey,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertNamespaceAccess } from '../lib/namespace-access';
import { assertProjectAccess } from '../lib/project-access';
import { getRequestPrincipal } from '../lib/request-principal';
import { pinoLogger } from '../middleware/logger';
import {
  ApiKeyCreatedResponse,
  ApiKeyResponse,
  CreateApiKeyRequest,
} from '../schemas/api-key-contracts';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

/** Strip sensitive fields (key_hash, user_id) from API key records. */
function toSafeApiKey({ key_hash, user_id, ...safe }: Record<string, unknown>) {
  return safe;
}

/** Extract the owning user from the trusted Session/Credential principal. */
// biome-ignore lint/suspicious/noExplicitAny: generic error handler
function getUserId(c: any): string | null {
  return getRequestPrincipal(c)?.userId ?? null;
}

// biome-ignore lint/suspicious/noExplicitAny: generic route context
function getAuthenticatedApiKey(c: any): ApiKey | undefined {
  return c.get('apiKey') as ApiKey | undefined;
}

// API-key and policy administration remain human operations. AUTH_DISABLED
// local mode has no credential and is intentionally allowed.
// biome-ignore lint/suspicious/noExplicitAny: generic route context
function rejectNonHumanAdministrator(c: any): Response | null {
  const apiKey = getAuthenticatedApiKey(c);
  if (apiKey !== undefined && apiKey.principal_kind !== 'human') {
    return errorResponse(c, 'FORBIDDEN', 'API key administration requires a human principal');
  }
  return null;
}

export const apiKeysRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// POST /v1/api-keys — Create API key
// ============================================================

const createApiKeyRoute = createRoute({
  method: 'post',
  path: '/v1/api-keys',
  tags: ['API Keys'],
  summary: 'Create a new API key',
  description:
    'Creates a new API key. The full key value is returned only in this response — store it securely.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateApiKeyRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'API key created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ApiKeyCreatedResponse),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

apiKeysRoutes.openapi(createApiKeyRoute, async (c) => {
  const body = c.req.valid('json');
  const userId = getUserId(c);

  try {
    const denied = rejectNonHumanAdministrator(c);
    if (denied) return denied;
    const db = await getDB();

    if (body.project_id) {
      const access = await assertProjectAccess(c, db, body.project_id);
      if (access instanceof Response) return access;
    }
    if (body.namespace_id) {
      const namespace = await findNamespaceById(db, body.namespace_id);
      if (!namespace) {
        return errorResponse(c, 'NOT_FOUND', `Namespace not found: ${body.namespace_id}`);
      }
      const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:read');
      if (denied) return denied;
    }

    // Generate a random key value
    const rawKey = `${API_KEY_VALUE_PREFIX}${randomBytes(24).toString('base64url')}`;

    const apiKey = await createApiKey(db, {
      name: body.name,
      projectId: body.project_id,
      namespaceId: body.namespace_id,
      userId: userId ?? undefined,
      principalKind: body.principal_kind,
      credentialKind: body.credential_kind,
      delegatorUserId: body.principal_kind === 'human' ? undefined : (userId ?? undefined),
      transitionScopes: body.transition_scopes,
      expiresAt: body.expires_at ? new Date(body.expires_at) : undefined,
      keyValue: rawKey,
    });

    return c.json(
      {
        success: true as const,
        data: {
          id: apiKey.id,
          key: rawKey,
          key_prefix: apiKey.key_prefix,
          name: apiKey.name,
          project_id: apiKey.project_id,
          namespace_id: apiKey.namespace_id,
          principal_kind: apiKey.principal_kind,
          credential_kind: apiKey.credential_kind,
          delegator_user_id: apiKey.delegator_user_id,
          transition_scopes: apiKey.transition_scopes,
          expires_at: apiKey.expires_at,
          created_at: apiKey.created_at,
        },
      },
      201
    );
  } catch (err) {
    pinoLogger.error({ err }, 'error creating API key');
    return errorResponse(c, 'CREATE_FAILED', 'Failed to create API key');
  }
});

// ============================================================
// GET /v1/api-keys — List API keys
// ============================================================

const listApiKeysRoute = createRoute({
  method: 'get',
  path: '/v1/api-keys',
  tags: ['API Keys'],
  summary: 'List API keys',
  description: 'Returns all non-revoked API keys. Does not include full key values.',
  request: {
    query: z.object({
      project_id: z.string().optional(),
      namespace_id: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of API keys',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(ApiKeyResponse)),
        },
      },
    },
  },
});

apiKeysRoutes.openapi(listApiKeysRoute, async (c) => {
  const { project_id, namespace_id } = c.req.valid('query');
  const userId = getUserId(c);

  try {
    const denied = rejectNonHumanAdministrator(c);
    if (denied) return denied;
    const db = await getDB();
    const keys = await listApiKeys(db, {
      projectId: project_id,
      namespaceId: namespace_id,
      userId: userId ?? undefined,
    });

    return c.json({
      success: true as const,
      data: keys.map((k) => toSafeApiKey(k as unknown as Record<string, unknown>)),
    });
  } catch (err) {
    pinoLogger.error({ err }, 'error listing API keys');
    return errorResponse(c, 'LIST_FAILED', 'Failed to list API keys');
  }
});

// ============================================================
// DELETE /v1/api-keys/:id — Revoke API key
// ============================================================

const revokeApiKeyRoute = createRoute({
  method: 'delete',
  path: '/v1/api-keys/{id}',
  tags: ['API Keys'],
  summary: 'Revoke an API key',
  description: 'Soft-deletes an API key. The key will no longer authenticate requests.',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    query: z.object({
      reason: z.enum(['manual', 'rotated', 'compromised']).optional().default('manual'),
    }),
  },
  responses: {
    200: {
      description: 'API key revoked',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ApiKeyResponse),
        },
      },
    },
    404: {
      description: 'API key not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

apiKeysRoutes.openapi(revokeApiKeyRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { reason } = c.req.valid('query');
  const userId = getUserId(c);

  try {
    const denied = rejectNonHumanAdministrator(c);
    if (denied) return denied;
    const db = await getDB();

    const existing = await findApiKeyById(db, id);
    if (!existing) {
      return errorResponse(c, 'API_KEY_NOT_FOUND', `API key not found: ${id}`);
    }

    // Verify ownership: user can only revoke their own keys
    if (userId && existing.user_id && existing.user_id !== userId) {
      return errorResponse(c, 'API_KEY_NOT_FOUND', `API key not found: ${id}`);
    }

    const revoked = await revokeApiKey(db, id, reason);
    if (!revoked) {
      return errorResponse(c, 'DELETE_FAILED', 'Failed to revoke API key');
    }

    return c.json({
      success: true as const,
      data: toSafeApiKey(revoked as unknown as Record<string, unknown>),
    });
  } catch (err) {
    pinoLogger.error({ err }, 'error revoking API key');
    return errorResponse(c, 'DELETE_FAILED', 'Failed to revoke API key');
  }
});
