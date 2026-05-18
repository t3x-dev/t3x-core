import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  findConversationById,
  findLatestSourceTextRevisionByTurn,
  findSourceTextRevisionById,
  findTurnByHash,
  hashSourceText,
  insertSourceTextRevision,
  listSourceTextRevisionsByConversation,
  updateSourceTextRevision,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const sourceTextRevisionRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

const SourceTextActionSchema = z.enum(['add', 'edit', 'delete']);
const SourceTextRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
const SourceTextRevisionStatusSchema = z.enum([
  'saved',
  'patched',
  'no_patch',
  'patch_failed',
  'synced',
  'discarded',
]);

const SourceTextRevisionSpanSchema = z.object({
  id: z.string(),
  action: SourceTextActionSchema,
  start: z.number().int(),
  end: z.number().int(),
  text: z.string(),
  originalText: z.string(),
});

const SourceTextRevisionResponseSchema = z.object({
  revision_id: z.string(),
  project_id: z.string(),
  conversation_id: z.string(),
  turn_hash: z.string(),
  turn_role: SourceTextRoleSchema,
  action: SourceTextActionSchema,
  start_char: z.number().int(),
  end_char: z.number().int(),
  selected_text: z.string(),
  replacement_text: z.string(),
  base_content: z.string(),
  content: z.string(),
  spans: z.array(SourceTextRevisionSpanSchema),
  base_content_hash: z.string(),
  status: SourceTextRevisionStatusSchema,
  patch_ops: z.array(z.unknown()).nullable(),
  patch_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const CreateSourceTextRevisionRequestSchema = z.object({
  project_id: z.string().min(1),
  conversation_id: z.string().min(1),
  turn_hash: z.string().min(1),
  turn_role: SourceTextRoleSchema,
  action: SourceTextActionSchema,
  start_char: z.number().int().nonnegative(),
  end_char: z.number().int().nonnegative(),
  selected_text: z.string(),
  replacement_text: z.string(),
  base_content: z.string(),
  content: z.string(),
  spans: z.array(SourceTextRevisionSpanSchema),
  base_content_hash: z.string().optional(),
});

const UpdateSourceTextRevisionRequestSchema = z.object({
  status: SourceTextRevisionStatusSchema.optional(),
  patch_ops: z.array(z.unknown()).nullable().optional(),
  patch_error: z.string().nullable().optional(),
});

function toApiRevision(row: Awaited<ReturnType<typeof findSourceTextRevisionById>>) {
  if (!row) return null;
  return {
    revision_id: row.revisionId,
    project_id: row.projectId,
    conversation_id: row.conversationId,
    turn_hash: row.turnHash,
    turn_role: row.turnRole as 'user' | 'assistant' | 'system' | 'tool',
    action: row.action as 'add' | 'edit' | 'delete',
    start_char: row.startChar,
    end_char: row.endChar,
    selected_text: row.selectedText,
    replacement_text: row.replacementText,
    base_content: row.baseContent,
    content: row.content,
    spans: row.spans,
    base_content_hash: row.baseContentHash,
    status: row.status as
      | 'saved'
      | 'patched'
      | 'no_patch'
      | 'patch_failed'
      | 'synced'
      | 'discarded',
    patch_ops: row.patchOps ?? null,
    patch_error: row.patchError ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const createSourceTextRevisionRoute = createRoute({
  method: 'post',
  path: '/v1/source-text-revisions',
  tags: ['Source Text Revisions'],
  summary: 'Persist a controlled source text edit',
  request: {
    body: {
      content: { 'application/json': { schema: CreateSourceTextRevisionRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Created source text revision',
      content: {
        'application/json': { schema: SuccessResponseSchema(SourceTextRevisionResponseSchema) },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Source entity not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Stale source edit',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const listSourceTextRevisionsRoute = createRoute({
  method: 'get',
  path: '/v1/source-text-revisions',
  tags: ['Source Text Revisions'],
  summary: 'List persisted source text revisions for a conversation',
  request: {
    query: z.object({
      project_id: z.string().min(1),
      conversation_id: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Source text revisions',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(SourceTextRevisionResponseSchema)),
        },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const updateSourceTextRevisionRoute = createRoute({
  method: 'patch',
  path: '/v1/source-text-revisions/{revisionId}',
  tags: ['Source Text Revisions'],
  summary: 'Update source text revision patch status',
  request: {
    params: z.object({ revisionId: z.string().min(1) }),
    body: {
      content: { 'application/json': { schema: UpdateSourceTextRevisionRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Updated source text revision',
      content: {
        'application/json': { schema: SuccessResponseSchema(SourceTextRevisionResponseSchema) },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Revision not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

sourceTextRevisionRoutes.openapi(createSourceTextRevisionRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const access = await assertProjectAccess(c, db, body.project_id);
    if (access instanceof Response) return access;

    const conversation = await findConversationById(db, body.conversation_id);
    if (!conversation || conversation.projectId !== body.project_id) {
      return errorResponse(c, 'CONVERSATION_NOT_FOUND', 'Conversation not found for project');
    }

    const turn = await findTurnByHash(db, body.turn_hash);
    if (
      !turn ||
      turn.projectId !== body.project_id ||
      turn.conversationId !== body.conversation_id
    ) {
      return errorResponse(c, 'NOT_FOUND', 'Turn not found for conversation');
    }

    const latest = await findLatestSourceTextRevisionByTurn(db, body.turn_hash);
    const expectedBase = latest?.content ?? turn.content;
    const expectedHash = hashSourceText(expectedBase);
    const receivedHash = body.base_content_hash ?? hashSourceText(body.base_content);
    if (receivedHash !== expectedHash || body.base_content !== expectedBase) {
      return errorResponse(c, 'CONFLICT', 'Source text changed. Refresh before editing again.', {
        expected_base_content_hash: expectedHash,
        received_base_content_hash: receivedHash,
      });
    }

    const revision = await insertSourceTextRevision(db, {
      projectId: body.project_id,
      conversationId: body.conversation_id,
      turnHash: body.turn_hash,
      turnRole: body.turn_role,
      action: body.action,
      startChar: body.start_char,
      endChar: body.end_char,
      selectedText: body.selected_text,
      replacementText: body.replacement_text,
      baseContent: body.base_content,
      content: body.content,
      spans: body.spans,
      baseContentHash: receivedHash,
    });

    return c.json({ success: true as const, data: toApiRevision(revision) }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

sourceTextRevisionRoutes.openapi(listSourceTextRevisionsRoute, async (c) => {
  const { project_id, conversation_id } = c.req.valid('query');

  try {
    const db = await getDB();
    const access = await assertProjectAccess(c, db, project_id);
    if (access instanceof Response) return access;

    const conversation = await findConversationById(db, conversation_id);
    if (!conversation || conversation.projectId !== project_id) {
      return errorResponse(c, 'CONVERSATION_NOT_FOUND', 'Conversation not found for project');
    }

    const revisions = await listSourceTextRevisionsByConversation(db, conversation_id);
    return c.json({ success: true as const, data: revisions.map(toApiRevision) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

sourceTextRevisionRoutes.openapi(updateSourceTextRevisionRoute, async (c) => {
  const { revisionId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const existing = await findSourceTextRevisionById(db, revisionId);
    if (!existing) {
      return errorResponse(c, 'NOT_FOUND', `Source text revision not found: ${revisionId}`);
    }

    const access = await assertProjectAccess(c, db, existing.projectId);
    if (access instanceof Response) return access;

    const revision = await updateSourceTextRevision(db, revisionId, {
      status: body.status,
      patchOps: body.patch_ops,
      patchError: body.patch_error,
    });
    if (!revision) {
      return errorResponse(c, 'NOT_FOUND', `Source text revision not found: ${revisionId}`);
    }

    return c.json({ success: true as const, data: toApiRevision(revision) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});
