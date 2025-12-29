/**
 * Turn schemas for API validation and OpenAPI spec
 */
import { z } from '@hono/zod-openapi';

// Turn role
export const TurnRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);

// Turn entity
export const TurnSchema = z.object({
  turn_hash: z.string(),
  parent_turn_hash: z.string().nullable(),
  project_id: z.string(),
  conversation_id: z.string(),
  role: TurnRoleSchema,
  content: z.string(),
  created_at: z.string().datetime(),
  metadata: z.record(z.unknown()).nullable(),
});

// Create turn request
export const CreateTurnSchema = z.object({
  project_id: z.string().min(1),
  conversation_id: z.string().min(1),
  role: TurnRoleSchema,
  content: z.string().min(1),
  parent_turn_hash: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// List turns query
export const ListTurnsQuerySchema = z.object({
  project_id: z.string().optional(),
  conversation_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// List turns response
export const ListTurnsResponseSchema = z.object({
  turns: z.array(TurnSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

// Turn chain response
export const TurnChainResponseSchema = z.object({
  chain: z.array(TurnSchema),
  count: z.number().int(),
});
