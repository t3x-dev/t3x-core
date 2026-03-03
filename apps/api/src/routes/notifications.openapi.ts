/**
 * Notifications Routes (OpenAPI)
 *
 * In-memory notification system for real-time alerts.
 * Notifications are ephemeral (reset on server restart).
 * Future: persist via storage schema-notifications.ts.
 *
 * GET  /v1/notifications              - List notifications for current session
 * POST /v1/notifications/:id/read     - Mark notification as read
 * POST /v1/notifications/read-all     - Mark all as read
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const notificationsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================================
// In-memory notification store (ephemeral)
// ============================================================================

interface Notification {
  id: string;
  type: 'conflict_detected' | 'merge_ready' | 'extraction_complete' | 'generation_done' | 'info';
  title: string;
  message: string;
  project_id?: string;
  ref_id?: string;
  read: boolean;
  created_at: string;
}

const notifications: Notification[] = [];
let nextId = 1;

/** Push a notification (called by other routes/services) */
export function pushNotification(opts: {
  type: Notification['type'];
  title: string;
  message: string;
  project_id?: string;
  ref_id?: string;
}) {
  const n: Notification = {
    id: `notif_${nextId++}`,
    type: opts.type,
    title: opts.title,
    message: opts.message,
    project_id: opts.project_id,
    ref_id: opts.ref_id,
    read: false,
    created_at: new Date().toISOString(),
  };
  notifications.unshift(n);
  // Keep at most 100 notifications
  if (notifications.length > 100) {
    notifications.length = 100;
  }
  return n;
}

// ============================================================================
// Schemas
// ============================================================================

const NotificationSchema = z.object({
  id: z.string(),
  type: z.enum([
    'conflict_detected',
    'merge_ready',
    'extraction_complete',
    'generation_done',
    'info',
  ]),
  title: z.string(),
  message: z.string(),
  project_id: z.string().nullable(),
  ref_id: z.string().nullable(),
  read: z.boolean(),
  created_at: z.string(),
});

// ============================================================================
// GET /v1/notifications
// ============================================================================

const listNotificationsRoute = createRoute({
  method: 'get',
  path: '/v1/notifications',
  tags: ['Notifications'],
  summary: 'List notifications',
  request: {
    query: z.object({
      project_id: z.string().optional(),
      unread_only: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Notification list',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(NotificationSchema)),
        },
      },
    },
  },
});

notificationsRoutes.openapi(listNotificationsRoute, async (c) => {
  const { project_id, unread_only } = c.req.valid('query');
  let result = notifications;

  if (project_id) {
    result = result.filter((n) => n.project_id === project_id);
  }
  if (unread_only === 'true') {
    result = result.filter((n) => !n.read);
  }

  return c.json(
    {
      success: true as const,
      data: result.map((n) => ({
        ...n,
        project_id: n.project_id ?? null,
        ref_id: n.ref_id ?? null,
      })),
    },
    200
  );
});

// ============================================================================
// POST /v1/notifications/:id/read
// ============================================================================

const markReadRoute = createRoute({
  method: 'post',
  path: '/v1/notifications/{id}/read',
  tags: ['Notifications'],
  summary: 'Mark notification as read',
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Marked as read',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ read: z.boolean() })),
        },
      },
    },
    404: {
      description: 'Notification not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

notificationsRoutes.openapi(markReadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const n = notifications.find((n) => n.id === id);
  if (!n) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Notification not found: ${id}` },
      },
      404
    );
  }
  n.read = true;
  return c.json({ success: true as const, data: { read: true } }, 200);
});

// ============================================================================
// POST /v1/notifications/read-all
// ============================================================================

const markAllReadRoute = createRoute({
  method: 'post',
  path: '/v1/notifications/read-all',
  tags: ['Notifications'],
  summary: 'Mark all notifications as read',
  request: {
    query: z.object({
      project_id: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'All marked as read',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ count: z.number() })),
        },
      },
    },
  },
});

notificationsRoutes.openapi(markAllReadRoute, async (c) => {
  const { project_id } = c.req.valid('query');
  let count = 0;
  for (const n of notifications) {
    if (project_id && n.project_id !== project_id) continue;
    if (!n.read) {
      n.read = true;
      count++;
    }
  }
  return c.json({ success: true as const, data: { count } }, 200);
});
