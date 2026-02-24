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
    entity_type: z.enum(['leaf', 'commit']).openapi({ description: 'Type of entity to share' }),
    entity_id: z.string().min(1).openapi({ description: 'ID of the entity to share' }),
    project_id: z.string().min(1).openapi({ description: 'Project the entity belongs to' }),
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
    entity_type: z.string(),
    entity_id: z.string(),
    entity: z.unknown().openapi({ description: 'The shared entity data (leaf or commit)' }),
  })
  .openapi('ShareResolveResponse');
