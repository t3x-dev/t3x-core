/**
 * Auth Me Route
 *
 * Returns the currently authenticated user's profile information.
 *
 * Endpoint:
 * - GET /v1/auth/me — Return current user info
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ApiKey } from '@t3x/core';
import { findUserById } from '@t3x/storage';
import { getDB } from '../lib/db';
import { createError, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const authMeRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const AuthMeResponse = z.object({
  id: z.string(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

// ============================================================
// GET /v1/auth/me — Return current user
// ============================================================

const meRoute = createRoute({
  method: 'get',
  path: '/v1/auth/me',
  tags: ['Auth'],
  summary: 'Get current user',
  description: 'Return the profile of the currently authenticated user.',
  responses: {
    200: {
      description: 'Current user info',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(AuthMeResponse),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

authMeRoutes.openapi(meRoute, async (c) => {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  if (!apiKey?.user_id) {
    return c.json(createError('UNAUTHORIZED', 'Not authenticated'), 401);
  }

  const db = await getDB();
  const user = await findUserById(db, apiKey.user_id);
  if (!user) {
    return c.json(createError('UNAUTHORIZED', 'User not found'), 401);
  }

  return c.json({
    success: true as const,
    data: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
    },
  });
});
