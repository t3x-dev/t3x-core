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

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
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
import {
  LocalProviderParamSchema,
  LocalProviderStatusSchema,
  LocalProviderWriteSchema,
  ProviderConfigSchema,
  ProviderListSchema,
  ProviderTestParamSchema,
  RoleAssignmentListSchema,
  RoleAssignmentWriteSchema,
  TestResultSchema,
} from '../schemas/providers';

export const providersRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
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

const ENV_KEY_BY_LOCAL_PROVIDER: Record<LocalProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_STUDIO_KEY',
};

function previewOfKey(key: string): string {
  // Last 4 chars; providers always emit opaque key strings like
  // "sk-ant-api03-…JnYA", so showing the tail identifies the key
  // without leaking it.
  const trimmed = key.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 4) return trimmed;
  return `…${trimmed.slice(-4)}`;
}

/**
 * Resolve which tier currently supplies the active key (env > file > none)
 * and return a preview + override flag. Read-only; does not mutate state.
 */
function resolveKeyProvenance(
  bundle: Awaited<ReturnType<typeof getProviderCredentialBundle>>,
  provider: LocalProviderId
): { source: 'env' | 'file' | 'none'; preview: string | null; envOverridesStored: boolean } {
  const envName = ENV_KEY_BY_LOCAL_PROVIDER[provider];
  const envKey = process.env[envName];
  const storedKey = bundle.secrets[envName as keyof typeof bundle.secrets];

  if (envKey && envKey.trim().length > 0) {
    return {
      source: 'env',
      preview: previewOfKey(envKey),
      envOverridesStored: Boolean(storedKey && storedKey.trim().length > 0),
    };
  }
  if (storedKey && storedKey.trim().length > 0) {
    return { source: 'file', preview: previewOfKey(storedKey), envOverridesStored: false };
  }
  return { source: 'none', preview: null, envOverridesStored: false };
}

function toSafeLocalProviderStatus(
  bundle: Awaited<ReturnType<typeof getProviderCredentialBundle>>,
  provider: LocalProviderId
) {
  const safe = bundle.safe[provider];
  const provenance = resolveKeyProvenance(bundle, provider);
  return {
    provider,
    // A provider is "configured" for runtime purposes if either the env or
    // stored key is present — mirror that here instead of file-only so the
    // UI's green dot matches what the resolver will actually use.
    configured: provenance.source !== 'none',
    default_model: safe.defaultModel,
    last_test_status: safe.lastTestStatus,
    last_tested_at: safe.lastTestedAt,
    last_test_error: safe.lastTestError,
    api_key_source: provenance.source,
    api_key_preview: provenance.preview,
    env_overrides_stored: provenance.envOverridesStored,
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

const VISIBLE_GENERATION_PROVIDER_IDS = new Set(['anthropic', 'openai', 'google-ai']);

function isVisibleProvider(provider: { id: string; role: string }): boolean {
  return provider.role !== 'generation' || VISIBLE_GENERATION_PROVIDER_IDS.has(provider.id);
}

function filterVisibleProviderIds(role: string, providerIds: string[]): string[] {
  if (role !== 'generation') return providerIds;
  return providerIds.filter((providerId) => VISIBLE_GENERATION_PROVIDER_IDS.has(providerId));
}

function serializeRoleAssignments(
  roles: Array<{ role: string; providerIds: string[] }>
): Array<{ role: string; provider_ids: string[] }> {
  return roles.map((role) => ({
    role: role.role,
    provider_ids: filterVisibleProviderIds(role.role, role.providerIds),
  }));
}

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
          schema: SuccessResponseSchema(ProviderListSchema),
        },
      },
    },
  },
});

providersRoutes.openapi(listProvidersRoute, async (c) => {
  await refreshProviderRegistryConfig();
  const registry = await getProviderRegistry();
  const providers = registry.listProviders().filter(isVisibleProvider);

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
          schema: SuccessResponseSchema(RoleAssignmentListSchema),
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
    data: serializeRoleAssignments(config.roles),
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
          schema: RoleAssignmentWriteSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated role assignments',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(RoleAssignmentListSchema),
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
      registry.assignRole(role, filterVisibleProviderIds(role, provider_ids));
    }
    await saveRegistryConfig();

    const config = registry.exportConfig();
    return c.json({
      success: true as const,
      data: serializeRoleAssignments(config.roles),
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

const getLocalProviderRoute = createRoute({
  method: 'get',
  path: '/v1/providers/local/{id}',
  tags: ['Providers'],
  summary: 'Get local provider credential status',
  request: {
    params: LocalProviderParamSchema,
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
    params: LocalProviderParamSchema,
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
    params: LocalProviderParamSchema,
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
    params: ProviderTestParamSchema,
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
          schema: SuccessResponseSchema(ProviderConfigSchema),
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
      roles: serializeRoleAssignments(config.roles),
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
          schema: ProviderConfigSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated config',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ProviderConfigSchema),
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
        providerIds: filterVisibleProviderIds(r.role, r.provider_ids),
      })),
    });
    await saveRegistryConfig();

    const config = registry.exportConfig();
    return c.json({
      success: true as const,
      data: {
        roles: serializeRoleAssignments(config.roles),
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
