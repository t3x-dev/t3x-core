/**
 * Export Contract Schemas (Zod)
 *
 * Request/response schemas for cfpack and ledger export endpoints.
 */

import { z } from '@hono/zod-openapi';

// ============================================================
// Query Parameter Schemas
// ============================================================

export const ExportQuery = z.object({
  project_id: z
    .string()
    .min(1)
    .openapi({ description: 'Project ID to export', example: 'proj_abc123' }),
});

// ============================================================
// Response Schemas (for OpenAPI documentation)
// ============================================================

export const CfpackResponse = z
  .object({
    version: z.string(),
    cfpack_schema_version: z.string(),
    project: z.object({
      project_id: z.string(),
      name: z.string(),
      created_at: z.string(),
    }),
    turns: z.array(z.unknown()),
    findings: z.object({
      aggregated_keywords: z.array(z.unknown()),
      must_have: z.array(z.string()),
      mustnt_have: z.array(z.string()),
      evidence_refs: z.array(z.unknown()),
    }),
    commits: z.array(z.unknown()),
    hash: z
      .object({
        algorithm: z.string(),
        pack_hash: z.string(),
      })
      .nullable(),
    meta: z.object({
      exported_at: z.string(),
      exported_by: z.string(),
    }),
  })
  .openapi('CfpackResponse');

export const LedgerLine = z
  .object({
    type: z.string(),
  })
  .passthrough()
  .openapi('LedgerLine');
