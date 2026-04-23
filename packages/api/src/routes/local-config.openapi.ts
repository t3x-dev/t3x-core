import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { clearStoredApiKey, resolveLocalConfigState, updateLocalConfig } from '../lib/local-config';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const LocalConfigStateSchema = z.object({
  api_url: z.string(),
  api_url_source: z.enum(['env', 'file', 'default']),
  api_key_present: z.boolean(),
  api_key_source: z.enum(['env', 'file', 'none']),
  api_key_preview: z.string().nullable(),
  config_path: z.string(),
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
