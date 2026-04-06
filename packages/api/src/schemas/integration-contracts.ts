// apps/api/src/schemas/integration-contracts.ts
import { z } from '@hono/zod-openapi';

// ============================================================
// Extract
// ============================================================

export const ExtractRequest = z
  .object({
    project_id: z.string().min(1).describe('Project ID'),
    text: z
      .string()
      .min(1)
      .max(100_000)
      .describe('Raw conversation text to extract from (max 100KB)'),
    conversation_id: z
      .string()
      .optional()
      .describe('Omit for one-shot, include for incremental extraction'),
    source: z.string().max(200).optional().describe('Source label (e.g. "slack", "email")'),
  })
  .openapi('ExtractRequest');

export const ExtractTree: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      key: z.string(),
      slots: z.record(z.string(), z.unknown()),
      children: z.array(ExtractTree).default([]),
      source: z.string().optional(),
    })
    .openapi('ExtractTree')
);

export const DriftItem = z
  .object({
    node_path: z.string(),
    before: z.string(),
    after: z.string(),
  })
  .openapi('DriftItem');

export const ExtractResponse = z
  .object({
    conversation_id: z.string(),
    draft_id: z.string(),
    trees: z.array(ExtractTree),
    yaml: z.string().optional(),
    drift: z.array(DriftItem).optional(),
    extraction_mode: z.enum(['llm', 'regex']).describe('Whether LLM or regex fallback was used'),
  })
  .openapi('ExtractResponse');

// ============================================================
// Check
// ============================================================

export const CheckRequest = z
  .object({
    project_id: z.string().min(1).describe('Project ID'),
    text: z.string().min(1).max(100_000).describe('Text to validate against constraints'),
    leaf_ids: z
      .array(z.string())
      .optional()
      .describe('Check specific leaves only (default: all project leaves)'),
  })
  .openapi('CheckRequest');

export const CheckViolation = z
  .object({
    leaf_id: z.string(),
    constraint_id: z.string(),
    type: z.enum(['require', 'exclude']),
    value: z.string(),
    reason: z.string().optional(),
  })
  .openapi('CheckViolation');

export const CheckResponse = z
  .object({
    passed: z.boolean(),
    violations: z.array(CheckViolation),
  })
  .openapi('CheckResponse');

// ============================================================
// Context (Show)
// ============================================================

export const ContextQuery = z
  .object({
    branch: z.string().optional().default('main').describe('Branch name (default: main)'),
    format: z.enum(['json', 'yaml']).optional().default('json').describe('Response format'),
  })
  .openapi('ContextQuery');

export const ContextResponse = z
  .object({
    commit_hash: z.string().nullable(),
    branch: z.string(),
    trees: z.array(ExtractTree),
    yaml: z.string().optional(),
  })
  .openapi('ContextResponse');

// ============================================================
// Commit from Draft
// ============================================================

export const CommitFromDraftRequest = z
  .object({
    project_id: z.string().min(1).describe('Project ID'),
    draft_id: z.string().min(1).describe('Draft ID from extract'),
    message: z.string().max(2000).optional().describe('Commit message'),
    branch: z.string().optional().default('main').describe('Branch to commit on'),
  })
  .openapi('CommitFromDraftRequest');

export const CommitFromDraftResponse = z
  .object({
    commit_hash: z.string(),
    tree_count: z.number(),
    branch: z.string(),
  })
  .openapi('CommitFromDraftResponse');
