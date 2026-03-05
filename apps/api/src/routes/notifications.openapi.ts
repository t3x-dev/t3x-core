/**
 * Notifications Routes (OpenAPI)
 *
 * Persistent notification system (Item 16).
 * Notifications are stored in the database and survive server restarts.
 *
 * GET  /v1/notifications              - List notifications
 * POST /v1/notifications/:id/read     - Mark notification as read
 * POST /v1/notifications/read-all     - Mark all as read
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CreateNotificationInput,
  insertNotification,
  listNotificationsFromDB,
  markAllNotificationsRead,
  markNotificationRead,
} from '@t3x/storage';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const notificationsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================================
// Push notification helper (called by other routes)
// ============================================================================

/**
 * Push a notification to the database.
 * Fire-and-forget: errors are silently ignored to not block the caller.
 */
export function pushNotification(opts: CreateNotificationInput) {
  // Fire-and-forget: push to DB asynchronously
  getDB()
    .then((db) => insertNotification(db, opts))
    .catch((err) => {
      pinoLogger.warn({ err, notification: opts.type }, 'failed to push notification');
    });
}

// ============================================================================
// Schemas
// ============================================================================

const NOTIFICATION_TYPES = [
  'commit.created',
  'merge.completed',
  'leaf.generated',
  'leaf.stale',
  'conflict.detected',
  'info',
] as const;

const NotificationSchema = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
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
  const db = await getDB();

  const rows = await listNotificationsFromDB(db, {
    project_id,
    unread_only: ['true', '1', 'yes'].includes(unread_only?.toLowerCase() ?? ''),
    limit: 100,
  });

  return c.json(
    {
      success: true as const,
      data: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        project_id: n.projectId ?? null,
        ref_id: n.refId ?? null,
        read: n.read,
        created_at: n.createdAt?.toISOString() ?? new Date().toISOString(),
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
  const db = await getDB();

  const updated = await markNotificationRead(db, id);
  if (!updated) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Notification not found: ${id}` },
      },
      404
    );
  }
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
  const db = await getDB();

  const count = await markAllNotificationsRead(db, project_id);
  return c.json({ success: true as const, data: { count } }, 200);
});
