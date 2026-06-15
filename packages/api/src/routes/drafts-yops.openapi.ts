/**
 * Drafts YOps Routes
 *
 * Apply YAML Operations (YOps) to a draft's tree content.
 * - POST /v1/drafts/:id/apply-yops — Apply YOps with optimistic locking
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { TreeNode } from '@t3x-dev/core';
import { applyYOps } from '@t3x-dev/core';
import { ConflictError, findDraftById, updateDraft } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';

export const draftsYopsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const ApplyYOpsRequest = z.object({
  yops: z.array(z.record(z.string(), z.unknown())).min(1),
  if_revision: z.number().int().min(0),
});

/** Count total slots across all trees recursively */
function countSlots(trees: TreeNode[]): number {
  let total = 0;
  for (const node of trees) {
    total += Object.keys(node.slots).length;
    total += countSlots(node.children);
  }
  return total;
}

const ApplyYOpsResponse = z.object({
  draft_id: z.string(),
  revision: z.number(),
  trees: z.array(z.unknown()),
  applied_count: z.number(),
  tree_count: z.number(),
  slot_count: z.number(),
});

// ============================================================
// Route Definition
// ============================================================

const applyYOpsRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/apply-yops',
  tags: ['Drafts', 'YOps'],
  operationId: 'applyYOpsToDraft',
  summary: 'Apply YOps to a draft',
  description:
    "Apply YAML Operations (YOps) to mutate a draft's structured state tree. " +
    'Use `GET /v1/docs/yops` to see all 18 available operations.\n\n' +
    '**Common operations:**\n' +
    '- `set: { path: "trip/budget", value: 5000 }` — update a single slot\n' +
    '- `populate: { path: "trip/hotel", values: { type: "ryokan", area: "Asakusa" } }` — fill multiple slots\n' +
    '- `define: { path: "trip/activities" }` — create a new empty node\n' +
    '- `drop: { path: "trip/old_plan" }` — remove a node and all children\n' +
    '- `unset: { path: "trip/budget/misc" }` — remove a single slot\n\n' +
    'Paths use `/` separator. Keys are `snake_case`. ' +
    'Requires `if_revision` for optimistic locking — get the current revision from `GET /v1/drafts/{id}`.',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: ApplyYOpsRequest } },
    },
  },
  responses: {
    200: {
      description: 'YOps applied successfully',
      content: { 'application/json': { schema: SuccessResponseSchema(ApplyYOpsResponse) } },
    },
    400: {
      description: 'Invalid request or draft status',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Revision conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handler
// ============================================================

draftsYopsRoutes.openapi(applyYOpsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { yops, if_revision } = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Find draft
    const draft = await findDraftById(db, id);
    if (!draft) {
      return errorResponse(c, 'DRAFT_NOT_FOUND', `Draft not found: ${id}`);
    }

    // 2. Check status — only 'editing' or 'auto' drafts can be modified
    if (draft.status === 'committed') {
      return errorResponse(c, 'ALREADY_COMMITTED', `Draft is already committed: ${id}`);
    }

    // 3. Check revision match before applying
    if (draft.revision !== if_revision) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'CONFLICT',
            message: `Revision mismatch: expected ${if_revision}, actual ${draft.revision}`,
          },
        },
        409
      );
    }

    // 4. Apply YOps to draft's tree content.
    //
    // Drafts persist `nodes_json` only — there is no `relations_json`
    // column on the drafts table. `relate` / `unrelate` ops would
    // validate at the engine layer and then evaporate when we wrote
    // back only `result.trees`. Reject them at the boundary so the
    // failure is loud instead of silent. Adding draft-side relation
    // persistence is the proper follow-up — see
    // packages/storage/src/schema-trees.ts:627 (drafts table).
    for (let i = 0; i < yops.length; i++) {
      const op = yops[i] as Record<string, unknown>;
      if ('relate' in op || 'unrelate' in op) {
        return errorResponse(
          c,
          'UNSUPPORTED_OP',
          'relate/unrelate ops are not supported on drafts — drafts persist trees only. ' +
            'Apply these ops via the conversation yops_log or a commit instead.',
          { op_index: i }
        );
      }
    }

    const trees = (draft.nodes ?? []) as TreeNode[];
    const content = { trees, relations: [] };
    const result = applyYOps(content, yops);

    if (!result.ok) {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        result.error?.message ?? 'YOps application failed',
        {
          yops_error: result.error,
          applied_count: result.applied,
        }
      );
    }

    // 5. Persist updated nodes via optimistic lock
    const updated = await updateDraft(db, id, { nodes: result.trees }, if_revision);

    return c.json(
      {
        success: true as const,
        data: {
          draft_id: updated.id,
          revision: updated.revision,
          trees: result.trees,
          applied_count: result.applied,
          tree_count: result.trees.length,
          slot_count: countSlots(result.trees),
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'CONFLICT', message: err.message },
        },
        409
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});
