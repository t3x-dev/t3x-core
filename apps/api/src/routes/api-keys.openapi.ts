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
import { API_KEY_VALUE_PREFIX } from '@t3x/core';
import { createApiKey, findApiKeyById, listApiKeys, revokeApiKey } from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { pinoLogger } from '../middleware/logger';
import {
  ApiKeyCreatedResponse,
  ApiKeyResponse,
  CreateApiKeyRequest,
} from '../schemas/api-key-contracts';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

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

  try {
    const db = await getDB();

    // Generate a random key value
    const rawKey = `${API_KEY_VALUE_PREFIX}${randomBytes(24).toString('base64url')}`;

    const apiKey = await createApiKey(db, {
      name: body.name,
      projectId: body.project_id,
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
          created_at: apiKey.created_at,
        },
      },
      201
    );
  } catch (err) {
    pinoLogger.error({ err }, "error creating API key");
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
  const { project_id } = c.req.valid('query');

  try {
    const db = await getDB();
    const keys = await listApiKeys(db, { projectId: project_id });

    return c.json({
      success: true as const,
      data: keys,
    });
  } catch (err) {
    pinoLogger.error({ err }, "error listing API keys");
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

  try {
    const db = await getDB();

    const existing = await findApiKeyById(db, id);
    if (!existing) {
      return errorResponse(c, 'API_KEY_NOT_FOUND', `API key not found: ${id}`);
    }

    const revoked = await revokeApiKey(db, id);
    if (!revoked) {
      return errorResponse(c, 'DELETE_FAILED', 'Failed to revoke API key');
    }

    return c.json({
      success: true as const,
      data: revoked,
    });
  } catch (err) {
    pinoLogger.error({ err }, "error revoking API key");
    return errorResponse(c, 'DELETE_FAILED', 'Failed to revoke API key');
  }
});
