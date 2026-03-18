/**
 * Drafts CRUD Routes
 *
 * Basic CRUD operations for Draft management.
 * - POST   /v1/drafts         - Create a new draft
 * - GET    /v1/drafts         - List drafts by project
 * - GET    /v1/drafts/:id     - Get draft by ID
 * - PATCH  /v1/drafts/:id     - Update draft (optimistic lock)
 * - DELETE /v1/drafts/:id     - Delete draft
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Draft } from '@t3x-dev/core';
import {
  ConflictError,
  deleteDraftV3,
  findDraftV3ById,
  insertDraftV3,
  listDraftV3ByProject,
  updateDraftV3,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import { CreateDraftRequest, DraftResponse, UpdateDraftRequest } from '../schemas/v4-contracts';
import { previewCache, previewDebounce } from './drafts-workflows.openapi';

export const draftsCrudRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Response helpers
// ============================================================

export function toApiDraft(draft: Draft) {
  return {
    id: draft.id,
    project_id: draft.project_id,
    title: draft.title,
    goal: draft.goal ?? null,
    parent_commit_hash: draft.parent_commit_hash ?? null,
    forked_from: draft.forked_from ?? null,
    sentences: draft.sentences ?? [],
    constraints: draft.constraints ?? [],
    instructions: draft.instructions ?? null,
    preview_type: draft.preview_type ?? null,
    preview_output: draft.preview_output ?? null,
    preview_generated_at: draft.preview_generated_at ?? null,
    status: draft.status,
    committed_as: draft.committed_as ?? null,
    committed_leaf_id: draft.committed_leaf_id ?? null,
    target_branch: draft.target_branch ?? null,
    revision: draft.revision,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    extraction_mode: draft.extraction_mode ?? null,
    semantic_points: draft.semantic_points ?? null,
    extraction_cursor: draft.extraction_cursor ?? null,
  };
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/drafts
const createDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts',
  tags: ['Drafts'],
  summary: 'Create a new draft',
  request: {
    body: {
      content: { 'application/json': { schema: CreateDraftRequest } },
    },
  },
  responses: {
    201: {
      description: 'Draft created',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/drafts
const listDraftsRoute = createRoute({
  method: 'get',
  path: '/v1/drafts',
  tags: ['Drafts'],
  summary: 'List drafts by project',
  request: {
    query: z.object({
      project_id: z.string().min(1),
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'List of drafts',
      content: { 'application/json': { schema: SuccessResponseSchema(z.array(DraftResponse)) } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/drafts/:id
const getDraftRoute = createRoute({
  method: 'get',
  path: '/v1/drafts/{id}',
  tags: ['Drafts'],
  summary: 'Get draft by ID',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Draft found',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// PATCH /v1/drafts/:id
const updateDraftRoute = createRoute({
  method: 'patch',
  path: '/v1/drafts/{id}',
  tags: ['Drafts'],
  summary: 'Update draft (optimistic lock)',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: UpdateDraftRequest } },
    },
  },
  responses: {
    200: {
      description: 'Draft updated',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
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

// DELETE /v1/drafts/:id
const deleteDraftRoute = createRoute({
  method: 'delete',
  path: '/v1/drafts/{id}',
  tags: ['Drafts'],
  summary: 'Delete draft',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Draft deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ deleted: z.literal(true), id: z.string() })),
        },
      },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/drafts
draftsCrudRoutes.openapi(createDraftRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const draft = await insertDraftV3(db, {
      project_id: body.project_id,
      title: body.title,
      goal: body.goal,
      parent_commit_hash: body.parent_commit_hash,
      target_branch: body.target_branch,
      preview_type: body.preview_type,
    });

    return c.json({ success: true as const, data: toApiDraft(draft) }, 201);
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return errorResponse(c, 'REFERENCE_NOT_FOUND', 'Referenced project not found');
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/drafts
draftsCrudRoutes.openapi(listDraftsRoute, async (c) => {
  const { project_id, status, limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();
    const drafts = await listDraftV3ByProject(db, project_id, { status, limit, offset });

    return c.json({ success: true as const, data: drafts.map(toApiDraft) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// GET /v1/drafts/:id
draftsCrudRoutes.openapi(getDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const draft = await findDraftV3ById(db, id);

    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft not found: ${id}`);
    }

    return c.json({ success: true as const, data: toApiDraft(draft) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// PATCH /v1/drafts/:id
draftsCrudRoutes.openapi(updateDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const { if_revision, ...updateFields } = body;

  try {
    const db = await getDB();
    const draft = await updateDraftV3(db, id, updateFields, if_revision);

    return c.json({ success: true as const, data: toApiDraft(draft) }, 200);
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

// DELETE /v1/drafts/:id
draftsCrudRoutes.openapi(deleteDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const draft = await findDraftV3ById(db, id);
    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft not found: ${id}`);
    }

    await deleteDraftV3(db, id);

    // Clean up in-memory preview cache and debounce state for this draft
    previewCache.delete(id);
    previewDebounce.delete(id);

    return c.json({ success: true as const, data: { deleted: true as const, id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});
