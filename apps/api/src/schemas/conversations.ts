/**
 * Conversation schemas for API validation and OpenAPI spec
 */
import { z } from 'zod';

// Conversation entity
export const ConversationSchema = z.object({
  conversation_id: z.string(),
  project_id: z.string(),
  title: z.string().nullable(),
  created_at: z.string().datetime(),
  metadata: z.record(z.unknown()).nullable(),
});

// Create conversation request
export const CreateConversationSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Update conversation request
export const UpdateConversationSchema = z.object({
  title: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// List conversations response
export const ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
