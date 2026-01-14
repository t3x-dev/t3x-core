/**
 * Commits V3 Zod schemas for API validation and OpenAPI spec
 */
import { z } from '@hono/zod-openapi';

// ============================================================
// Sentence schemas
// ============================================================

export const SentenceSourceSchema = z.object({
  turn_hash: z.string().min(1),
  start_char: z.number().int().min(0),
  end_char: z.number().int().min(0),
});

export const SentenceSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  source: SentenceSourceSchema,
});

// ============================================================
// Constraint schemas
// ============================================================

export const RequireConstraintSchema = z.object({
  type: z.literal('require'),
  id: z.string().min(1),
  value: z.string(),
  match: z.enum(['exact', 'semantic']),
  source_sentence_id: z.string().optional(),
  suggested: z.boolean().optional(),
});

export const ExcludeConstraintSchema = z.object({
  type: z.literal('exclude'),
  id: z.string().min(1),
  value: z.string(),
  match: z.enum(['exact', 'semantic']),
  reason: z.string().optional(),
});

export const ConstraintSchema = z.discriminatedUnion('type', [
  RequireConstraintSchema,
  ExcludeConstraintSchema,
]);

// ============================================================
// Content schema
// ============================================================

export const CommitV3ContentSchema = z.object({
  sentences: z.array(SentenceSchema),
  constraints: z.array(ConstraintSchema).optional(),
});

// ============================================================
// Author schema
// ============================================================

export const CommitV3AuthorSchema = z.object({
  name: z.string(),
  identity: z.string().optional(),
  verification: z.enum(['none', 'device', 'verified']).optional(),
});

// ============================================================
// Position schema
// ============================================================

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// ============================================================
// Request schemas
// ============================================================

export const CreateCommitV3Schema = z.object({
  project_id: z.string().min(1),
  branch: z.string().default('main'),
  message: z.string().optional(),
  parents: z.array(z.string()).optional(),
  content: CommitV3ContentSchema,
  position: PositionSchema.optional(),
});

export const ListCommitsV3QuerySchema = z.object({
  project_id: z.string().min(1),
  branch: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================
// Response schemas
// ============================================================

export const CommitV3Schema = z.object({
  hash: z.string(),
  schema: z.string(),
  parents: z.array(z.string()),
  author: CommitV3AuthorSchema,
  committed_at: z.string(),
  content: CommitV3ContentSchema,
  project_id: z.string().nullable(),
  message: z.string().nullable(),
  branch: z.string().nullable(),
  position: PositionSchema.optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ListCommitsV3ResponseSchema = z.object({
  commits: z.array(CommitV3Schema),
  project_id: z.string(),
  branch: z.string().optional(),
  limit: z.number(),
  offset: z.number(),
});
