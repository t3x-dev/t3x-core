/**
 * Auth Me Routes
 *
 * Endpoints for the currently authenticated user's profile.
 *
 * - GET  /v1/auth/me — Return current user info + linked accounts
 * - PATCH /v1/auth/me — Update profile (name, avatar_url)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiKey, getAllModels, getCanonicalModelId, getModelInfo } from '@t3x-dev/core';
import {
  findAccountsByUser,
  findUserById,
  getGlobalSetting,
  listApiKeys,
  revokeApiKey,
  setGlobalSetting,
  updateUser,
} from '@t3x-dev/storage';
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

const QuickSwitcherModelSchema = z.object({
  model: z.string(),
  visible: z.boolean(),
  available: z.boolean(),
});

const PersonalModelPreferencesSchema = z.object({
  compose_default: z.string(),
  fallback_model: z.string().nullable(),
  quick_switcher: z.array(QuickSwitcherModelSchema),
});

const UpdatePersonalModelPreferencesSchema = z.object({
  compose_default: z.string(),
  fallback_model: z.string().nullable(),
  quick_switcher: z.array(z.object({ model: z.string(), visible: z.boolean() })),
});

const ProfileSettingsSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
  timezone: z.string(),
  sessions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      current: z.boolean(),
      last_active: z.string().nullable(),
    })
  ),
});

const UpdateProfileSettingsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  avatar_url: z.string().nullable().optional(),
  timezone: z.string().min(1).max(100),
});

type StoredPersonalModelPreferences = z.infer<typeof UpdatePersonalModelPreferencesSchema>;

const ORGANIZATION_MODEL_ACCESS_KEY = 'organization_model_access_v1';

function personalModelPreferencesKey(userId: string): string {
  return `personal_model_preferences_v1_${userId}`;
}

function profileTimezoneKey(userId: string): string {
  return `profile_timezone_v1_${userId}`;
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

async function availableModelIds(db: Awaited<ReturnType<typeof getDB>>): Promise<Set<string>> {
  const organization = await getGlobalSetting<{ enabled_models?: string[] }>(
    db,
    ORGANIZATION_MODEL_ACCESS_KEY
  );
  return new Set(organization?.enabled_models ?? getAllModels().map((model) => model.id));
}

function defaultPersonalModelPreferences(): StoredPersonalModelPreferences {
  const models = getAllModels().map((model) => model.id);
  return {
    compose_default: models[0] ?? '',
    fallback_model: models[1] ?? null,
    quick_switcher: models.slice(0, 4).map((model) => ({ model, visible: true })),
  };
}

function validatePersonalModelPreferences(input: StoredPersonalModelPreferences): string | null {
  const modelIds = [
    input.compose_default,
    ...(input.fallback_model ? [input.fallback_model] : []),
    ...input.quick_switcher.map((item) => item.model),
  ];
  if (
    new Set(input.quick_switcher.map((item) => item.model)).size !== input.quick_switcher.length
  ) {
    return 'Quick switcher models must be unique';
  }
  return modelIds.find((model) => !getModelInfo(model)) ? 'Unknown model in preferences' : null;
}

// ============================================================
// Helpers
// ============================================================

/** Extract and validate userId from API key context. Returns userId or error response. */
// biome-ignore lint/suspicious/noExplicitAny: generic error handler
function getUserId(c: any): string | null {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  return apiKey?.user_id ?? null;
}

// biome-ignore lint/suspicious/noExplicitAny: generic Hono context
function getCurrentApiKeyId(c: any): string | null {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  return apiKey?.id ?? null;
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

const personalModelPreferencesRoute = createRoute({
  method: 'get',
  path: '/v1/auth/me/model-preferences',
  tags: ['Auth'],
  summary: 'Get personal model preferences',
  responses: {
    200: {
      description: 'Personal model preferences',
      content: {
        'application/json': { schema: SuccessResponseSchema(PersonalModelPreferencesSchema) },
      },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
authMeRoutes.openapi(personalModelPreferencesRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json(createError('UNAUTHORIZED', 'Not authenticated'), 401);
  const db = await getDB();
  const stored =
    (await getGlobalSetting<StoredPersonalModelPreferences>(
      db,
      personalModelPreferencesKey(userId)
    )) ?? defaultPersonalModelPreferences();
  const available = await availableModelIds(db);
  return c.json({
    success: true as const,
    data: {
      ...stored,
      quick_switcher: stored.quick_switcher.map((item) => ({
        ...item,
        available: available.has(item.model),
      })),
    },
  });
});

const updatePersonalModelPreferencesRoute = createRoute({
  method: 'put',
  path: '/v1/auth/me/model-preferences',
  tags: ['Auth'],
  summary: 'Update personal model preferences',
  request: {
    body: {
      content: { 'application/json': { schema: UpdatePersonalModelPreferencesSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated personal model preferences',
      content: {
        'application/json': { schema: SuccessResponseSchema(PersonalModelPreferencesSchema) },
      },
    },
    400: {
      description: 'Invalid model preferences',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
authMeRoutes.openapi(updatePersonalModelPreferencesRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json(createError('UNAUTHORIZED', 'Not authenticated'), 401);
  const body = c.req.valid('json');
  const validationError = validatePersonalModelPreferences(body);
  if (validationError) {
    return c.json(
      {
        success: false as const,
        error: { code: 'INVALID_MODEL_PREFERENCES', message: validationError },
      },
      400
    );
  }
  const db = await getDB();
  const available = await availableModelIds(db);
  if (
    !available.has(body.compose_default) ||
    (body.fallback_model && !available.has(body.fallback_model))
  ) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'MODEL_UNAVAILABLE',
          message: 'Default and fallback models must be available',
        },
      },
      400
    );
  }
  const composeProvider = getModelInfo(body.compose_default)?.provider ?? null;
  const updatedUser = await updateUser(db, userId, {
    default_provider: composeProvider,
    default_model: body.compose_default,
  });
  if (!updatedUser) return c.json(createError('UNAUTHORIZED', 'User not found'), 401);
  await setGlobalSetting(db, personalModelPreferencesKey(userId), body);
  return c.json({
    success: true as const,
    data: {
      ...body,
      quick_switcher: body.quick_switcher.map((item) => ({
        ...item,
        available: available.has(item.model),
      })),
    },
  });
});

const profileSettingsRoute = createRoute({
  method: 'get',
  path: '/v1/auth/me/profile-settings',
  tags: ['Auth'],
  summary: 'Get personal profile settings and active sessions',
  responses: {
    200: {
      description: 'Personal profile settings',
      content: { 'application/json': { schema: SuccessResponseSchema(ProfileSettingsSchema) } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
authMeRoutes.openapi(profileSettingsRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json(createError('UNAUTHORIZED', 'Not authenticated'), 401);
  const db = await getDB();
  const user = await findUserById(db, userId);
  if (!user) return c.json(createError('UNAUTHORIZED', 'User not found'), 401);
  const storedProfile = await getGlobalSetting<{ timezone?: string }>(
    db,
    profileTimezoneKey(userId)
  );
  const timezone =
    storedProfile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const currentApiKeyId = getCurrentApiKeyId(c);
  const sessions = (await listApiKeys(db, { userId }))
    .filter((key) => key.name.startsWith('session:'))
    .map((key) => ({
      id: key.id,
      name: key.name,
      current: key.id === currentApiKeyId,
      last_active: key.last_used_at,
    }));
  return c.json({
    success: true as const,
    data: {
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      timezone,
      sessions,
    },
  });
});

const updateProfileSettingsRoute = createRoute({
  method: 'patch',
  path: '/v1/auth/me/profile-settings',
  tags: ['Auth'],
  summary: 'Update personal profile settings',
  request: {
    body: { content: { 'application/json': { schema: UpdateProfileSettingsSchema } } },
  },
  responses: {
    200: {
      description: 'Updated profile settings',
      content: { 'application/json': { schema: SuccessResponseSchema(ProfileSettingsSchema) } },
    },
    400: {
      description: 'Invalid profile settings',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
authMeRoutes.openapi(updateProfileSettingsRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json(createError('UNAUTHORIZED', 'Not authenticated'), 401);
  const body = c.req.valid('json');
  if (!validTimezone(body.timezone)) {
    return c.json(createError('INVALID_REQUEST', `Unknown time zone: ${body.timezone}`), 400);
  }
  const db = await getDB();
  const updated = await updateUser(db, userId, {
    name: body.name,
    ...(body.avatar_url ? { avatar_url: body.avatar_url } : {}),
  });
  if (!updated) return c.json(createError('UNAUTHORIZED', 'User not found'), 401);
  await setGlobalSetting(db, profileTimezoneKey(userId), { timezone: body.timezone });
  const currentApiKeyId = getCurrentApiKeyId(c);
  const sessions = (await listApiKeys(db, { userId }))
    .filter((key) => key.name.startsWith('session:'))
    .map((key) => ({
      id: key.id,
      name: key.name,
      current: key.id === currentApiKeyId,
      last_active: key.last_used_at,
    }));
  return c.json({
    success: true as const,
    data: {
      name: updated.name,
      email: updated.email,
      avatar_url: updated.avatar_url,
      timezone: body.timezone,
      sessions,
    },
  });
});

const revokeProfileSessionRoute = createRoute({
  method: 'delete',
  path: '/v1/auth/me/profile-settings/sessions/{id}',
  tags: ['Auth'],
  summary: 'Sign out an active session',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: 'Session revoked',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ revoked: z.literal(true) })),
        },
      },
    },
    400: {
      description: 'Current session cannot be revoked here',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Session not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
authMeRoutes.openapi(revokeProfileSessionRoute, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json(createError('UNAUTHORIZED', 'Not authenticated'), 401);
  const sessionId = c.req.valid('param').id;
  if (sessionId === getCurrentApiKeyId(c)) {
    return c.json(createError('INVALID_REQUEST', 'Use sign out to end the current session'), 400);
  }
  const db = await getDB();
  const session = (await listApiKeys(db, { userId })).find(
    (key) => key.id === sessionId && key.name.startsWith('session:')
  );
  if (!session) return c.json(createError('NOT_FOUND', 'Session not found'), 404);
  await revokeApiKey(db, sessionId);
  return c.json({ success: true as const, data: { revoked: true as const } });
});
