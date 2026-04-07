/**
 * YOps Validate Route with OpenAPI
 *
 * Stateless dry-run endpoint for validating YOps operations.
 * Applies the given YOps to the provided trees/relations in-memory
 * without persisting anything to the database.
 *
 * Endpoints:
 * - POST /v1/yops/validate - Validate YOps (dry-run)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { applyYOps } from '@t3x-dev/core';
import { zodErrorHook } from '../lib/errors';

// ============================================================
// Schemas
// ============================================================

const TreeNodeSchema = z.object({
  key: z.string(),
  slots: z.record(z.string(), z.any()).default({}),
  children: z.array(z.any()).default([]),
  source: z.record(z.string(), z.any()).optional(),
});

const ValidateRequestSchema = z.object({
  trees: z.array(TreeNodeSchema).min(1),
  relations: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.string(),
      }),
    )
    .default([]),
  yops: z.array(z.record(z.string(), z.any())).min(1),
});

const ValidateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    ok: z.boolean(),
    applied: z.number(),
    preview: z
      .object({
        trees: z.array(z.any()),
        relations: z.array(z.any()),
      })
      .optional(),
    error: z
      .object({
        op_index: z.number(),
        code: z.string(),
        message: z.string(),
      })
      .optional(),
  }),
});

// ============================================================
// Route Definition
// ============================================================

const validateRoute = createRoute({
  method: 'post',
  path: '/v1/yops/validate',
  tags: ['YOps'],
  summary: 'Validate YOps (dry-run)',
  description:
    'Applies YOps to the provided trees/relations in-memory without persisting. Returns a preview of the result or the first error encountered.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ValidateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Validation result',
      content: {
        'application/json': {
          schema: ValidateResponseSchema,
        },
      },
    },
  },
});

// ============================================================
// Pre-validation helpers
// ============================================================

/**
 * Navigate a plain-object document to the value at the given slash-separated path.
 * Returns undefined if any segment is missing or if a non-object is encountered.
 */
function resolveDocPath(doc: Record<string, unknown>, path: string): unknown | undefined {
  const segments = path.split('/').filter(Boolean);
  let current: unknown = doc;
  for (const seg of segments) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    const map = current as Record<string, unknown>;
    if (!(seg in map)) return undefined;
    current = map[seg];
  }
  return current;
}

/**
 * For `set` ops, verify that the parent path (all segments except the last)
 * already exists in the document. This prevents silent creation of unexpected
 * intermediate nodes when the caller intends to update an existing slot.
 *
 * Returns an error descriptor if validation fails, or null if OK.
 */
function preValidateSetOp(
  doc: Record<string, unknown>,
  op: Record<string, unknown>,
  opIndex: number,
): { op_index: number; code: string; message: string } | null {
  if (!('set' in op)) return null;

  const setOp = op.set as Record<string, unknown>;
  const path = typeof setOp?.path === 'string' ? setOp.path : null;
  if (!path) return null;

  // Split into segments; parent is everything except the last segment
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= 1) return null; // top-level set is always valid

  const parentPath = segments.slice(0, -1).join('/');
  const parentValue = resolveDocPath(doc, parentPath);

  if (parentValue === undefined) {
    return {
      op_index: opIndex,
      code: 'PATH_NOT_FOUND',
      message: `Parent path "${parentPath}" does not exist`,
    };
  }

  return null;
}

// ============================================================
// Router + Handler
// ============================================================

export const yopsValidateRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

yopsValidateRoutes.openapi(validateRoute, async (c) => {
  const { trees, relations, yops } = c.req.valid('json');
  const content = { trees: trees as any, relations: relations as any };

  // Build the YValue document for pre-validation
  // We reconstruct it manually to avoid importing treesToYValue (not in public API)
  const doc: Record<string, unknown> = {};
  for (const tree of trees) {
    doc[tree.key] = { ...tree.slots };
    for (const child of tree.children ?? []) {
      (doc[tree.key] as Record<string, unknown>)[(child as any).key] = (child as any).slots ?? {};
    }
  }

  // Pre-validate set ops for parent path existence
  for (let i = 0; i < yops.length; i++) {
    const validationError = preValidateSetOp(doc, yops[i], i);
    if (validationError) {
      return c.json({
        success: true as const,
        data: {
          ok: false,
          applied: i,
          error: validationError,
        },
      });
    }
  }

  const result = applyYOps(content, yops as any);

  if (result.ok) {
    return c.json({
      success: true as const,
      data: {
        ok: true,
        applied: result.applied,
        preview: { trees: result.trees, relations: result.relations },
      },
    });
  }

  return c.json({
    success: true as const,
    data: {
      ok: false,
      applied: result.applied,
      error: {
        op_index: result.error?.op_index ?? result.applied,
        code: result.error?.code ?? 'UNKNOWN',
        message: result.error?.message ?? 'Unknown error',
      },
    },
  });
});
