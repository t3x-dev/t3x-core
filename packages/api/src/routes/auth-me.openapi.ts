/**
 * Auth Me Routes
 *
 * Endpoints for the currently authenticated user's profile.
 *
 * - GET  /v1/auth/me — Return current user info + linked accounts
 * - PATCH /v1/auth/me — Update profile (name, avatar_url)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiKey, getCanonicalModelId, getModelInfo } from '@t3x-dev/core';
import { findAccountsByUser, findUserById, updateUser } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { createError, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { ExtractionStyleSchema } from '../schemas/contracts';

export const authMeRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const LinkedAccountSchema = z.object({
  provider: z.string(),
  provider_account_id: z.string(),
  created_at: z.string(),
});

const AuthMeResponse = z.object({
  id: z.string(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
  default_provider: z.string().nullable().optional(),
  default_model: z.string().nullable().optional(),
  default_extraction_style: ExtractionStyleSchema.nullable().optional(),
  linked_accounts: z.array(LinkedAccountSchema),
});

const UpdateMeBody = z
  .object({
    name: z.string().optional(),
    avatar_url: z.string().optional(),
    default_provider: z.string().nullable().optional(),
    default_model: z.string().nullable().optional(),
    default_extraction_style: ExtractionStyleSchema.nullable().optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.avatar_url !== undefined ||
      d.default_provider !== undefined ||
      d.default_model !== undefined ||
      d.default_extraction_style !== undefined,
    { message: 'At least one field must be provided' }
  );

const UpdateMeResponse = z.object({
  id: z.string(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
  default_provider: z.string().nullable().optional(),
  default_model: z.string().nullable().optional(),
  default_extraction_style: ExtractionStyleSchema.nullable().optional(),
});

// ============================================================
// Helpers
// ============================================================

/** Extract and validate userId from API key context. Returns userId or error response. */
// biome-ignore lint/suspicious/noExplicitAny: generic error handler
function getUserId(c: any): string | null {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  return apiKey?.user_id ?? null;
}

function normalizeDefaultProvider(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDefaultModel(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return getCanonicalModelId(trimmed) ?? trimmed;
}

// ============================================================
// GET /v1/auth/me — Return current user + linked accounts
// ============================================================

const meRoute = createRoute({
  method: 'get',
  path: '/v1/auth/me',
  tags: ['Auth'],
  summary: 'Get current user',
  description:
    'Return the profile of the currently authenticated user, including linked OAuth accounts.',
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

// @ts-expect-error - OpenAPI handler return type
authMeRoutes.openapi(meRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json(createError('UNAUTHORIZED', 'Not authenticated'), 401);
  }

  const db = await getDB();
  const user = await findUserById(db, userId);
  if (!user) {
    return c.json(createError('UNAUTHORIZED', 'User not found'), 401);
  }

  const accountRows = await findAccountsByUser(db, userId);
  const linked_accounts = accountRows.map((a) => ({
    provider: a.provider,
    provider_account_id: a.provider_account_id,
    created_at: a.created_at,
  }));

  return c.json({
    success: true as const,
    data: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      default_provider: user.default_provider ?? null,
      default_model: user.default_model ?? null,
      default_extraction_style: user.default_extraction_style ?? null,
      linked_accounts,
    },
  });
});

// ============================================================
// PATCH /v1/auth/me — Update profile
// ============================================================

const updateMeRoute = createRoute({
  method: 'patch',
  path: '/v1/auth/me',
  tags: ['Auth'],
  summary: 'Update current user profile',
  description: 'Update the name and/or avatar_url of the currently authenticated user.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateMeBody,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated user info',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(UpdateMeResponse),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
authMeRoutes.openapi(updateMeRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json(createError('UNAUTHORIZED', 'Not authenticated'), 401);
  }

  const body = c.req.valid('json');
  const defaultProvider = normalizeDefaultProvider(body.default_provider);
  const defaultModel = normalizeDefaultModel(body.default_model);

  if (
    defaultProvider !== undefined &&
    defaultProvider !== null &&
    !['anthropic', 'openai', 'google'].includes(defaultProvider)
  ) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_PROVIDER',
          message: `Unknown provider: ${body.default_provider}`,
        },
      },
      400
    );
  }

  if (defaultModel !== undefined && defaultModel !== null && !getModelInfo(defaultModel)) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_MODEL',
          message: `Unknown model: ${body.default_model}`,
        },
      },
      400
    );
  }

  if (defaultProvider && defaultModel && getModelInfo(defaultModel)?.provider !== defaultProvider) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'MODEL_PROVIDER_MISMATCH',
          message: `Model ${defaultModel} does not match provider: ${defaultProvider}`,
        },
      },
      400
    );
  }

  const db = await getDB();
  const updated = await updateUser(db, userId, {
    name: body.name,
    avatar_url: body.avatar_url,
    default_provider: defaultProvider,
    default_model: defaultModel,
    default_extraction_style: body.default_extraction_style,
  });

  if (!updated) {
    return c.json(createError('UNAUTHORIZED', 'User not found'), 401);
  }

  return c.json({
    success: true as const,
    data: {
      id: updated.id,
      name: updated.name,
      username: updated.username,
      email: updated.email,
      avatar_url: updated.avatar_url,
      default_provider: updated.default_provider ?? null,
      default_model: updated.default_model ?? null,
      default_extraction_style: updated.default_extraction_style ?? null,
    },
  });
});
