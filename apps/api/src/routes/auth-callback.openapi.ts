/**
 * Auth Callback Route (OpenAPI)
 *
 * Called by NextAuth JWT callback to find-or-create a user on first login.
 * Also provisions a user-level API key so the WebUI can authenticate API requests.
 *
 * Endpoint:
 * - POST /v1/auth/callback — Find or create user by OAuth provider
 */

import { randomBytes } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { API_KEY_VALUE_PREFIX } from '@t3x/core';
import { createApiKey, findOrCreateUser } from '@t3x/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const authCallbackRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const AuthCallbackRequest = z.object({
  provider: z.string().min(1),
  provider_id: z.string().min(1),
  email: z.string().nullable().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});

const AuthCallbackResponse = z.object({
  id: z.string(),
  api_key: z.string(),
});

// ============================================================
// POST /v1/auth/callback — Find or create user
// ============================================================

const authCallbackRoute = createRoute({
  method: 'post',
  path: '/v1/auth/callback',
  tags: ['Auth'],
  summary: 'Find or create user by OAuth provider',
  description:
    'Called by the WebUI NextAuth callback to persist a user on first login. Returns the user ID and a session API key for authenticated API requests.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AuthCallbackRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User found or created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(AuthCallbackResponse),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

authCallbackRoutes.openapi(authCallbackRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const user = await findOrCreateUser(db, body);

    // Generate a session API key for the WebUI to use
    const rawKey = `${API_KEY_VALUE_PREFIX}${randomBytes(24).toString('base64url')}`;
    await createApiKey(db, {
      name: `session:${user.id}`,
      userId: user.id,
      keyValue: rawKey,
    });

    return c.json({
      success: true as const,
      data: { id: user.id, api_key: rawKey },
    });
  } catch (err) {
    pinoLogger.error({ err }, 'error in auth callback');
    return errorResponse(c, 'CREATE_FAILED', 'Failed to find or create user');
  }
});
