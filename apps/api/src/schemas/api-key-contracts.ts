/**
 * API Key Contract Schemas (Zod)
 *
 * Request/response schemas for API key management endpoints.
 */

import { z } from '@hono/zod-openapi';

// ============================================================
// Request Schemas
// ============================================================

export const CreateApiKeyRequest = z
  .object({
    name: z.string().min(1).max(100).openapi({ description: 'Human-readable label for the key' }),
    project_id: z
      .string()
      .optional()
      .openapi({ description: 'Scope key to a specific project (optional, null = global)' }),
  })
  .openapi('CreateApiKeyRequest');

// ============================================================
// Response Schemas
// ============================================================

/** Returned at creation time — includes the full key value (shown only once) */
export const ApiKeyCreatedResponse = z
  .object({
    id: z.string(),
    key: z
      .string()
      .openapi({ description: 'Full API key value. Store securely — shown only once.' }),
    key_prefix: z.string(),
    name: z.string(),
    project_id: z.string().nullable(),
    created_at: z.string(),
  })
  .openapi('ApiKeyCreatedResponse');

/** Returned for list/get — does NOT include the full key value */
export const ApiKeyResponse = z
  .object({
    id: z.string(),
    key_prefix: z.string(),
    name: z.string(),
    project_id: z.string().nullable(),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
  })
  .openapi('ApiKeyResponse');
