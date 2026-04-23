import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { clearStoredApiKey, resolveLocalConfigState, updateLocalConfig } from '../lib/local-config';
import { checkLocalAccess } from '../lib/local-config-check';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const LocalConfigStateSchema = z.object({
  api_url: z.string(),
  api_url_source: z.enum(['env', 'file', 'default']),
  api_key_present: z.boolean(),
  api_key_source: z.enum(['env', 'file', 'none']),
  api_key_preview: z.string().nullable(),
  config_path: z.string(),
});

const LocalAccessCheckSchema = z.object({
  ok: z.boolean(),
  code: z.enum([
    'ACCESS_OK',
    'AUTH_NOT_REQUIRED',
    'MISSING_API_KEY',
    'INVALID_API_KEY',
    'API_UNREACHABLE',
    'API_ERROR',
  ]),
  auth_mode: z.enum(['open', 'protected', 'unreachable']),
  message: z.string(),
  api_url: z.string(),
  api_key_present: z.boolean(),
  api_key_source: z.enum(['env', 'file', 'none']),
  status_code: z.number().nullable(),
});

const UpdateLocalConfigBody = z
  .object({
    api_url: z.string().optional(),
    api_key: z.string().optional(),
  })
  .refine((body) => body.api_url !== undefined || body.api_key !== undefined, {
    message: 'At least one field must be provided',
  });

export const localConfigRoutes = new OpenAPIHono();

const getRoute = createRoute({
  method: 'get',
  path: '/v1/local-config',
  tags: ['Local Config'],
  summary: 'Get current local shared config state',
  responses: {
    200: {
      description: 'Local config state',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LocalConfigStateSchema),
        },
      },
    },
  },
});

localConfigRoutes.openapi(getRoute, async (c) =>
  c.json({
    success: true as const,
    data: resolveLocalConfigState(),
  })
);

const putRoute = createRoute({
  method: 'put',
  path: '/v1/local-config',
  tags: ['Local Config'],
  summary: 'Update file-backed local shared config',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateLocalConfigBody,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated local config state',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LocalConfigStateSchema),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

localConfigRoutes.openapi(putRoute, async (c) => {
  const body = c.req.valid('json');
  return c.json({
    success: true as const,
    data: updateLocalConfig(body),
  });
});

const deleteApiKeyRoute = createRoute({
  method: 'delete',
  path: '/v1/local-config/api-key',
  tags: ['Local Config'],
  summary: 'Clear the file-backed api key from local shared config',
  responses: {
    200: {
      description: 'Updated local config state',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LocalConfigStateSchema),
        },
      },
    },
  },
});

localConfigRoutes.openapi(deleteApiKeyRoute, async (c) =>
  c.json({
    success: true as const,
    data: clearStoredApiKey(),
  })
);

const checkRoute = createRoute({
  method: 'post',
  path: '/v1/local-config/check',
  tags: ['Local Config'],
  summary: 'Check whether the effective local shared access can reach the target API',
  responses: {
    200: {
      description: 'Local access check result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LocalAccessCheckSchema),
        },
      },
    },
  },
});

localConfigRoutes.openapi(checkRoute, async (c) =>
  c.json({
    success: true as const,
    data: await checkLocalAccess(),
  })
);
