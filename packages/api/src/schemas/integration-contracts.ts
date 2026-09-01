// apps/api/src/schemas/integration-contracts.ts
import { z } from '@hono/zod-openapi';

export const ExtractTree: z.ZodType<unknown> = z
  .lazy(() =>
    z.object({
      key: z.string(),
      slots: z.record(z.string(), z.unknown()),
      children: z.array(ExtractTree).default([]),
      source: z.string().optional(),
    })
  )
  .openapi('ExtractTree', {
    type: 'object',
    required: ['key', 'slots'],
    properties: {
      key: { type: 'string' },
      slots: { type: 'object', additionalProperties: true },
      children: {
        type: 'array',
        items: { $ref: '#/components/schemas/ExtractTree' },
      },
      source: { type: 'string' },
    },
  });

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
