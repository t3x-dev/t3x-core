/**
 * Webhook Contract Schemas (Zod)
 *
 * Request/response schemas for webhook management endpoints.
 */

import { z } from '@hono/zod-openapi';

// ============================================================
// Enums
// ============================================================

export const WebhookEventEnum = z.enum([
  'commit.created',
  'merge.completed',
  'leaf.created',
  'leaf.generated',
  'run.completed',
  'run.failed',
  'extraction.drift',
  'extraction.review_needed',
  'draft.ready',
  'check.failed',
  '*',
]);

// ============================================================
// Request Schemas
// ============================================================

export const CreateWebhookRequest = z
  .object({
    url: z.string().url().openapi({ description: 'Target URL to receive POST callbacks' }),
    events: z
      .array(WebhookEventEnum)
      .min(1)
      .openapi({ description: 'Event types to subscribe to' }),
    secret: z.string().optional().openapi({ description: 'Secret for HMAC-SHA256 signature' }),
    project_id: z
      .string()
      .optional()
      .openapi({ description: 'Scope to a specific project (null = global)' }),
  })
  .openapi('CreateWebhookRequest');

export const UpdateWebhookRequest = z
  .object({
    url: z.string().url().optional(),
    events: z.array(WebhookEventEnum).min(1).optional(),
    secret: z.string().optional(),
    active: z.boolean().optional(),
  })
  .openapi('UpdateWebhookRequest');

// ============================================================
// Response Schemas
// ============================================================

export const WebhookResponse = z
  .object({
    webhook_id: z.string(),
    project_id: z.string().nullable(),
    url: z.string(),
    events: z.array(z.string()),
    secret: z.string().nullable(),
    active: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('WebhookResponse');

// ============================================================
// Query Parameter Schemas
// ============================================================

export const ListWebhooksQuery = z.object({
  project_id: z.string().optional(),
});
