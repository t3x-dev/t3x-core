/**
 * Webhook Routes with OpenAPI
 *
 * Endpoints:
 * - POST   /v1/webhooks          - Create webhook
 * - GET    /v1/webhooks          - List webhooks
 * - GET    /v1/webhooks/:id      - Get webhook
 * - PATCH  /v1/webhooks/:id      - Update webhook
 * - DELETE /v1/webhooks/:id      - Delete webhook
 * - POST   /v1/webhooks/:id/test - Send test event
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createWebhook,
  deleteWebhook,
  findWebhookById,
  listWebhooks,
  updateWebhook,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { isInternalUrlResolved } from '../lib/ssrf';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  CreateWebhookRequest,
  ListWebhooksQuery,
  UpdateWebhookRequest,
  WebhookResponse,
} from '../schemas/webhook-contracts';

export const webhooksRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

/**
 * Mask a webhook secret for list/get responses.
 * Shows only the last 4 characters so the user can identify which secret was set
 * without exposing the full value.
 */
function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  if (secret.length <= 4) return '****';
  return `****${secret.slice(-4)}`;
}

/**
 * Map a webhook record to API response, masking the secret.
 * The full secret is only returned on CREATE so the user can save it once.
 */
function toMaskedWebhook<T extends { secret?: string | null }>(webhook: T): T {
  return { ...webhook, secret: maskSecret(webhook.secret) };
}

// ============================================================
// POST /v1/webhooks — Create webhook
// ============================================================

const createWebhookRoute = createRoute({
  method: 'post',
  path: '/v1/webhooks',
  tags: ['Webhooks'],
  summary: 'Create a webhook subscription',
  description: 'Creates a new webhook that receives POST callbacks when specified events occur.',
  request: {
    body: {
      content: { 'application/json': { schema: CreateWebhookRequest } },
    },
  },
  responses: {
    201: {
      description: 'Webhook created',
      content: { 'application/json': { schema: SuccessResponseSchema(WebhookResponse) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

webhooksRoutes.openapi(createWebhookRoute, async (c) => {
  const body = c.req.valid('json');

  if (await isInternalUrlResolved(body.url)) {
    return errorResponse(c, 'INVALID_REQUEST', 'Webhook URL targets a blocked internal address');
  }

  try {
    const db = await getDB();

    // Access control check (if project-scoped)
    if (body.project_id) {
      const accessResult = await assertProjectAccess(c, db, body.project_id);
      if (accessResult instanceof Response) return accessResult;
    }

    const webhook = await createWebhook(db, {
      url: body.url,
      events: body.events,
      secret: body.secret,
      projectId: body.project_id,
    });

    return c.json({ success: true as const, data: webhook }, 201);
  } catch (_err) {
    return errorResponse(c, 'CREATE_FAILED', 'Failed to create webhook');
  }
});

// ============================================================
// GET /v1/webhooks — List webhooks
// ============================================================

const listWebhooksRoute = createRoute({
  method: 'get',
  path: '/v1/webhooks',
  tags: ['Webhooks'],
  summary: 'List webhooks',
  description: 'Returns all webhooks, optionally filtered by project.',
  request: {
    query: ListWebhooksQuery,
  },
  responses: {
    200: {
      description: 'List of webhooks',
      content: { 'application/json': { schema: SuccessResponseSchema(z.array(WebhookResponse)) } },
    },
  },
});

webhooksRoutes.openapi(listWebhooksRoute, async (c) => {
  const { project_id } = c.req.valid('query');

  try {
    const db = await getDB();

    // Access control check (if project-scoped)
    if (project_id) {
      const accessResult = await assertProjectAccess(c, db, project_id);
      if (accessResult instanceof Response) return accessResult;
    }

    const hooks = await listWebhooks(db, { projectId: project_id });
    return c.json({ success: true as const, data: hooks.map(toMaskedWebhook) });
  } catch (_err) {
    return errorResponse(c, 'LIST_FAILED', 'Failed to list webhooks');
  }
});

// ============================================================
// GET /v1/webhooks/:id — Get webhook
// ============================================================

const getWebhookRoute = createRoute({
  method: 'get',
  path: '/v1/webhooks/{id}',
  tags: ['Webhooks'],
  summary: 'Get webhook details',
  description: 'Returns a specific webhook by ID.',
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Webhook found',
      content: { 'application/json': { schema: SuccessResponseSchema(WebhookResponse) } },
    },
    404: {
      description: 'Webhook not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

webhooksRoutes.openapi(getWebhookRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const webhook = await findWebhookById(db, id);

    if (!webhook) {
      return errorResponse(c, 'WEBHOOK_NOT_FOUND', `Webhook not found: ${id}`);
    }

    return c.json({ success: true as const, data: toMaskedWebhook(webhook) });
  } catch (_err) {
    return errorResponse(c, 'GET_FAILED', 'Failed to get webhook');
  }
});

// ============================================================
// PATCH /v1/webhooks/:id — Update webhook
// ============================================================

const updateWebhookRoute = createRoute({
  method: 'patch',
  path: '/v1/webhooks/{id}',
  tags: ['Webhooks'],
  summary: 'Update a webhook',
  description: 'Update webhook URL, events, secret, or active status.',
  request: {
    params: z.object({ id: z.string().min(1) }),
    body: {
      content: { 'application/json': { schema: UpdateWebhookRequest } },
    },
  },
  responses: {
    200: {
      description: 'Webhook updated',
      content: { 'application/json': { schema: SuccessResponseSchema(WebhookResponse) } },
    },
    404: {
      description: 'Webhook not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

webhooksRoutes.openapi(updateWebhookRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  if (body.url && (await isInternalUrlResolved(body.url))) {
    return errorResponse(c, 'INVALID_REQUEST', 'Webhook URL targets a blocked internal address');
  }

  try {
    const db = await getDB();

    const existing = await findWebhookById(db, id);
    if (!existing) {
      return errorResponse(c, 'WEBHOOK_NOT_FOUND', `Webhook not found: ${id}`);
    }

    const updated = await updateWebhook(db, id, body);
    if (!updated) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to update webhook');
    }

    return c.json({ success: true as const, data: toMaskedWebhook(updated) });
  } catch (_err) {
    return errorResponse(c, 'UPDATE_FAILED', 'Failed to update webhook');
  }
});

// ============================================================
// DELETE /v1/webhooks/:id — Delete webhook
// ============================================================

const deleteWebhookRoute = createRoute({
  method: 'delete',
  path: '/v1/webhooks/{id}',
  tags: ['Webhooks'],
  summary: 'Delete a webhook',
  description: 'Permanently removes a webhook subscription.',
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Webhook deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ deleted: z.boolean(), id: z.string() })),
        },
      },
    },
    404: {
      description: 'Webhook not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

webhooksRoutes.openapi(deleteWebhookRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    const existing = await findWebhookById(db, id);
    if (!existing) {
      return errorResponse(c, 'WEBHOOK_NOT_FOUND', `Webhook not found: ${id}`);
    }

    const deleted = await deleteWebhook(db, id);
    if (!deleted) {
      return errorResponse(c, 'DELETE_FAILED', 'Failed to delete webhook');
    }

    return c.json({ success: true as const, data: { deleted: true, id } });
  } catch (_err) {
    return errorResponse(c, 'DELETE_FAILED', 'Failed to delete webhook');
  }
});

// ============================================================
// POST /v1/webhooks/:id/test — Send test event
// ============================================================

const testWebhookRoute = createRoute({
  method: 'post',
  path: '/v1/webhooks/{id}/test',
  tags: ['Webhooks'],
  summary: 'Send a test event to a webhook',
  description: 'Sends a test event to the webhook URL to verify connectivity.',
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Test event sent',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ status: z.number(), ok: z.boolean() })),
        },
      },
    },
    404: {
      description: 'Webhook not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

webhooksRoutes.openapi(testWebhookRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const webhook = await findWebhookById(db, id);

    if (!webhook) {
      return errorResponse(c, 'WEBHOOK_NOT_FOUND', `Webhook not found: ${id}`);
    }

    const body = JSON.stringify({
      event: 'webhook.test',
      payload: { webhook_id: webhook.webhook_id, test: true },
      timestamp: new Date().toISOString(),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-T3X-Event': 'webhook.test',
    };

    if (webhook.secret) {
      const { createHmac } = await import('node:crypto');
      const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');
      headers['X-T3X-Signature'] = signature;
    }

    if (await isInternalUrlResolved(webhook.url)) {
      return errorResponse(c, 'INVALID_REQUEST', 'Webhook URL targets a blocked internal address');
    }

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    return c.json({
      success: true as const,
      data: { status: response.status, ok: response.ok },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Test failed';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});
