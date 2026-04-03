/**
 * Provider Routes (OpenAPI)
 *
 * Manage LLM and Embedding providers.
 *
 * GET    /v1/providers              - List all providers
 * GET    /v1/providers/roles        - Get role assignments
 * PUT    /v1/providers/roles        - Update role assignments
 * POST   /v1/providers/:id/test     - Test provider connection
 * GET    /v1/providers/config       - Get global provider config
 * PUT    /v1/providers/config       - Update global provider config
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { zodErrorHook } from '../lib/errors';
import { getProviderRegistry, saveRegistryConfig } from '../lib/provider-registry';
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
      available_models: p.availableModels ?? null,
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

  const entry = registry.getEntry(id);
  if (!entry) {
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

  const result = await registry.testConnection(id);
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
