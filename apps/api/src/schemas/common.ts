/**
 * Common Zod schemas for API validation and OpenAPI spec
 */
import { z } from 'zod';

// Pagination
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// Error response
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
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
