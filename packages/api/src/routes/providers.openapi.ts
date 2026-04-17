/**
 * Provider Routes (OpenAPI)
 *
 * Manage LLM and Embedding providers.
 *
 * GET    /v1/providers              - List all providers
 * GET    /v1/providers/roles        - Get role assignments
 * PUT    /v1/providers/roles        - Update role assignments
 * GET    /v1/providers/local/:id    - Get local provider credential status
 * PUT    /v1/providers/local/:id    - Upsert local provider credential
 * DELETE /v1/providers/local/:id    - Delete local provider credential
 * POST   /v1/providers/:id/test     - Test provider connection
 * GET    /v1/providers/config       - Get global provider config
 * PUT    /v1/providers/config       - Update global provider config
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getModelsByProvider, type ProviderName } from '@t3x-dev/core';
import {
  deleteProviderCredential,
  getProviderCredentialBundle,
  type LocalProviderId,
  updateProviderCredentialTestResult,
  upsertProviderCredential,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import {
  getProviderRegistry,
  refreshProviderRegistryConfig,
  saveRegistryConfig,
} from '../lib/provider-registry';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const providersRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['generation', 'embedding', 'merge']),
  configured: z.boolean(),
  roles: z.array(z.enum(['generation', 'embedding', 'merge'])),
  required_env_keys: z.array(z.string()),
  default_model: z.string().nullable(),
  available_models: z.array(z.string()).nullable(),
});

const RoleAssignmentSchema = z.object({
  role: z.enum(['generation', 'embedding', 'merge']),
  provider_ids: z.array(z.string()),
});

const TestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  latency_ms: z.number().optional(),
});

const LocalProviderIdSchema = z.enum(['anthropic', 'openai', 'google']);

const LocalProviderStatusSchema = z.object({
  provider: LocalProviderIdSchema,
  configured: z.boolean(),
  default_model: z.string().nullable(),
  last_test_status: z.enum(['ok', 'error']).nullable(),
  last_tested_at: z.string().nullable(),
  last_test_error: z.string().nullable(),
});

const LocalProviderWriteSchema = z.object({
  api_key: z.string().trim().min(1),
  default_model: z.string().nullable().optional(),
});

const LOCAL_PROVIDER_ALIASES: Record<string, LocalProviderId> = {
  anthropic: 'anthropic',
  claude: 'anthropic',
  openai: 'openai',
  gpt: 'openai',
  google: 'google',
  'google-ai': 'google',
  gemini: 'google',
};

function normalizeLocalProviderId(id: string): LocalProviderId | null {
  return LOCAL_PROVIDER_ALIASES[id.toLowerCase()] ?? null;
}

function getRuntimeProviderId(provider: LocalProviderId): 'anthropic' | 'openai' | 'google-ai' {
  return provider === 'google' ? 'google-ai' : provider;
}

function toSafeLocalProviderStatus(
  bundle: Awaited<ReturnType<typeof getProviderCredentialBundle>>,
  provider: LocalProviderId
) {
  const safe = bundle.safe[provider];
  return {
    provider,
    configured: safe.configured,
    default_model: safe.defaultModel,
    last_test_status: safe.lastTestStatus,
    last_tested_at: safe.lastTestedAt,
    last_test_error: safe.lastTestError,
  };
}

function normalizeDefaultModel(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const SHARED_GENERATION_PROVIDER_CATALOG: Partial<Record<string, ProviderName>> = {
  anthropic: 'anthropic',
  openai: 'openai',
  'google-ai': 'google',
};

function getAvailableModelsForProvider(
  providerId: string,
  role: string,
  fallback: string[] | null | undefined
) {
  if (role !== 'generation') {
    return fallback ?? null;
  }

  const providerName = SHARED_GENERATION_PROVIDER_CATALOG[providerId];
  if (!providerName) {
    return fallback ?? null;
  }

  return getModelsByProvider(providerName).map((model) => model.id);
}

// ============================================================
// GET /v1/providers — List all providers
// ============================================================

const listProvidersRoute = createRoute({
  method: 'get',
  path: '/v1/providers',
  tags: ['Providers'],
  summary: 'List all registered providers',
  responses: {
    200: {
      description: 'Provider list',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(ProviderSchema)),
        },
      },
    },
  },
});

providersRoutes.openapi(listProvidersRoute, async (c) => {
  await refreshProviderRegistryConfig();
  const registry = await getProviderRegistry();
  const providers = registry.listProviders();

  return c.json({
    success: true as const,
    data: providers.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      configured: p.configured,
      roles: p.roles,
      required_env_keys: p.requiredEnvKeys,
      default_model: p.defaultModel ?? null,
      available_models: getAvailableModelsForProvider(p.id, p.role, p.availableModels),
    })),
  });
});

// ============================================================
// GET /v1/providers/roles — Get role assignments
// ============================================================

const getRolesRoute = createRoute({
  method: 'get',
  path: '/v1/providers/roles',
  tags: ['Providers'],
  summary: 'Get current role assignments',
  responses: {
    200: {
      description: 'Role assignments',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(RoleAssignmentSchema)),
        },
      },
    },
  },
});

providersRoutes.openapi(getRolesRoute, async (c) => {
  const registry = await getProviderRegistry();
  const config = registry.exportConfig();

  return c.json({
    success: true as const,
    data: config.roles.map((r) => ({
      role: r.role,
      provider_ids: r.providerIds,
    })),
  });
});

// ============================================================
// PUT /v1/providers/roles — Update role assignments
// ============================================================

const updateRolesRoute = createRoute({
  method: 'put',
  path: '/v1/providers/roles',
  tags: ['Providers'],
  summary: 'Update role assignments',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            roles: z.array(RoleAssignmentSchema),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated role assignments',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(RoleAssignmentSchema)),
        },
      },
    },
    400: {
      description: 'Invalid provider ID',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
providersRoutes.openapi(updateRolesRoute, async (c) => {
  const body = c.req.valid('json');
  const registry = await getProviderRegistry();

  try {
    for (const { role, provider_ids } of body.roles) {
      registry.assignRole(role, provider_ids);
    }
    await saveRegistryConfig();

    const config = registry.exportConfig();
    return c.json({
      success: true as const,
      data: config.roles.map((r) => ({
        role: r.role,
        provider_ids: r.providerIds,
      })),
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_PROVIDER',
          message: err instanceof Error ? err.message : 'Failed to update roles',
        },
      },
      400
    );
  }
});

// ============================================================
// GET /v1/providers/local/:id — Get local provider credential status
// PUT /v1/providers/local/:id — Upsert local provider credential
// DELETE /v1/providers/local/:id — Delete local provider credential
// ============================================================

const localProviderParamSchema = z.object({
  id: z.string(),
});

const getLocalProviderRoute = createRoute({
  method: 'get',
  path: '/v1/providers/local/{id}',
  tags: ['Providers'],
  summary: 'Get local provider credential status',
  request: {
    params: localProviderParamSchema,
  },
  responses: {
    200: {
      description: 'Local provider status',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LocalProviderStatusSchema),
        },
      },
    },
    404: {
      description: 'Local provider not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
providersRoutes.openapi(getLocalProviderRoute, async (c) => {
  const { id } = c.req.valid('param');
  const provider = normalizeLocalProviderId(id);

  if (!provider) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'NOT_FOUND',
          message: `Provider "${id}" not found`,
        },
      },
      404
    );
  }

  const db = await getDB();
  const bundle = await getProviderCredentialBundle(db);
  return c.json({
    success: true as const,
    data: toSafeLocalProviderStatus(bundle, provider),
  });
});

const upsertLocalProviderRoute = createRoute({
  method: 'put',
  path: '/v1/providers/local/{id}',
  tags: ['Providers'],
  summary: 'Upsert local provider credential',
  request: {
    params: localProviderParamSchema,
    body: {
      content: {
        'application/json': {
          schema: LocalProviderWriteSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Local provider status',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LocalProviderStatusSchema),
        },
      },
    },
    404: {
      description: 'Local provider not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
providersRoutes.openapi(upsertLocalProviderRoute, async (c) => {
  const { id } = c.req.valid('param');
  const provider = normalizeLocalProviderId(id);

  if (!provider) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'NOT_FOUND',
          message: `Provider "${id}" not found`,
        },
      },
      404
    );
  }

  const body = c.req.valid('json');
  const db = await getDB();
  await upsertProviderCredential(db, {
    providerId: provider,
    apiKey: body.api_key,
    defaultModel: normalizeDefaultModel(body.default_model),
  });
  await refreshProviderRegistryConfig();

  const bundle = await getProviderCredentialBundle(db);
  return c.json({
    success: true as const,
    data: toSafeLocalProviderStatus(bundle, provider),
  });
});

const deleteLocalProviderRoute = createRoute({
  method: 'delete',
  path: '/v1/providers/local/{id}',
  tags: ['Providers'],
  summary: 'Delete local provider credential',
  request: {
    params: localProviderParamSchema,
  },
  responses: {
    200: {
      description: 'Local provider status',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LocalProviderStatusSchema),
        },
      },
    },
    404: {
      description: 'Local provider not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
providersRoutes.openapi(deleteLocalProviderRoute, async (c) => {
  const { id } = c.req.valid('param');
  const provider = normalizeLocalProviderId(id);

  if (!provider) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'NOT_FOUND',
          message: `Provider "${id}" not found`,
        },
      },
      404
    );
  }

  const db = await getDB();
  await deleteProviderCredential(db, provider);
  await refreshProviderRegistryConfig();

  const bundle = await getProviderCredentialBundle(db);
  return c.json({
    success: true as const,
    data: toSafeLocalProviderStatus(bundle, provider),
  });
});

// ============================================================
// POST /v1/providers/:id/test — Test provider connection
// ============================================================

const testProviderRoute = createRoute({
  method: 'post',
  path: '/v1/providers/{id}/test',
  tags: ['Providers'],
  summary: 'Test provider connection',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Test result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(TestResultSchema),
        },
      },
    },
    404: {
      description: 'Provider not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
providersRoutes.openapi(testProviderRoute, async (c) => {
  const { id } = c.req.valid('param');
  const registry = await getProviderRegistry();
  const localProvider = normalizeLocalProviderId(id);
  const runtimeProviderId = localProvider ? getRuntimeProviderId(localProvider) : id;

  const entry = registry.getEntry(runtimeProviderId);
  if (!entry) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Provider "${id}" not found` },
      },
      404
    );
  }

  if (localProvider) {
    await refreshProviderRegistryConfig();
  }

  const result = await registry.testConnection(runtimeProviderId);

  if (localProvider) {
    try {
      const db = await getDB();
      const bundle = await getProviderCredentialBundle(db);
      if (bundle.safe[localProvider].configured) {
        await updateProviderCredentialTestResult(db, localProvider, {
          lastTestStatus: result.ok ? 'ok' : 'error',
          lastTestedAt: new Date(),
          lastTestError: result.error ?? null,
        });
        await refreshProviderRegistryConfig();
      }
    } catch {
      // Best-effort local metadata persistence only.
    }
  }

  return c.json({
    success: true as const,
    data: {
      ok: result.ok,
      ...(result.error && { error: result.error }),
      ...(result.latencyMs != null && { latency_ms: result.latencyMs }),
    },
  });
});

// ============================================================
// GET /v1/providers/config — Get global config
// ============================================================

const getConfigRoute = createRoute({
  method: 'get',
  path: '/v1/providers/config',
  tags: ['Providers'],
  summary: 'Get global provider configuration',
  responses: {
    200: {
      description: 'Provider config',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              roles: z.array(RoleAssignmentSchema),
            })
          ),
        },
      },
    },
  },
});

providersRoutes.openapi(getConfigRoute, async (c) => {
  const registry = await getProviderRegistry();
  const config = registry.exportConfig();

  return c.json({
    success: true as const,
    data: {
      roles: config.roles.map((r) => ({
        role: r.role,
        provider_ids: r.providerIds,
      })),
    },
  });
});

// ============================================================
// PUT /v1/providers/config — Update global config
// ============================================================

const updateConfigRoute = createRoute({
  method: 'put',
  path: '/v1/providers/config',
  tags: ['Providers'],
  summary: 'Update global provider configuration',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            roles: z.array(RoleAssignmentSchema),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated config',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              roles: z.array(RoleAssignmentSchema),
            })
          ),
        },
      },
    },
    400: {
      description: 'Invalid config',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
providersRoutes.openapi(updateConfigRoute, async (c) => {
  const body = c.req.valid('json');
  const registry = await getProviderRegistry();

  try {
    registry.importConfig({
      roles: body.roles.map((r) => ({
        role: r.role,
        providerIds: r.provider_ids,
      })),
    });
    await saveRegistryConfig();

    const config = registry.exportConfig();
    return c.json({
      success: true as const,
      data: {
        roles: config.roles.map((r) => ({
          role: r.role,
          provider_ids: r.providerIds,
        })),
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_CONFIG',
          message: err instanceof Error ? err.message : 'Failed to update config',
        },
      },
      400
    );
  }
});
