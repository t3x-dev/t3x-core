/**
 * Common Zod schemas for API validation and OpenAPI spec
 *
 * IMPORTANT: Use z from @hono/zod-openapi to ensure compatibility with OpenAPI routes.
 * Do NOT import from 'zod' directly as it may resolve to a different version.
 */
import { z } from '@hono/zod-openapi';

// Pagination (offset-based, legacy)
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// Cursor-based pagination (keyset)
export const CursorPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  cursor: z.string().optional(),
});

// Cursor page response wrapper
export const CursorPageResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  });

// Error response
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

// Success response wrapper
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

// Common ID parameter
export const IdParamSchema = z.object({
  id: z.string().min(1),
});

// Hash parameter (for commits, turns)
export const HashParamSchema = z.object({
  hash: z.string().min(1),
});
