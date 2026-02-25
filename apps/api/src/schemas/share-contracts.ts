/**
 * Share Link Contract Schemas (Zod)
 *
 * Request/response schemas for share link endpoints.
 */

import { z } from '@hono/zod-openapi';
// ============================================================
// Request Schemas
// ============================================================

export const CreateShareLinkRequest = z
  .object({
    entity_type: z
      .enum(['leaf', 'run', 'comparison'])
      .openapi({ description: 'Type of entity to share' }),
    entity_id: z.string().min(1).openapi({ description: 'ID of the entity to share' }),
  })
  .openapi('CreateShareLinkRequest');

// ============================================================
// Response Schemas
// ============================================================

export const ShareLinkResponse = z
  .object({
    id: z.string(),
    token: z.string(),
    entity_type: z.string(),
    entity_id: z.string(),
    project_id: z.string(),
    created_by: z.string().nullable(),
    created_at: z.string(),
    expires_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
  })
  .openapi('ShareLinkResponse');

export const ShareResolveResponse = z
  .object({
    token_info: ShareLinkResponse,
    entity: z.unknown().openapi({ description: 'The shared entity (Leaf or Run)' }),
  })
  .openapi('ShareResolveResponse');
