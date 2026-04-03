/**
 * Conversation schemas for API validation and OpenAPI spec
 *
 * IMPORTANT: Use z from @hono/zod-openapi to ensure compatibility with OpenAPI routes.
 * Do NOT import from 'zod' directly as it may resolve to a different version.
 */
import { z } from '@hono/zod-openapi';

// Conversation entity
export const ConversationSchema = z.object({
  conversation_id: z.string(),
  project_id: z.string(),
  title: z.string().nullable(),
  created_at: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).nullable(),
});

// Create conversation request
export const CreateConversationSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Update conversation request
export const UpdateConversationSchema = z.object({
  title: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// List conversations response
export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
