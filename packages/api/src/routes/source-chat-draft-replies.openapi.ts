import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  createInferenceRuntime,
  getInferenceRuntime,
  InferenceAdmissionDeniedError,
  resolveInferenceActor,
  resolveInferenceRunId,
} from '../lib/inference';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import {
  createSourceChatDraftReply,
  SourceChatDraftReplyError,
} from '../lib/source-chat-draft-reply';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const SourceChatDraftReplyRequestSchema = z
  .object({
    conversation_id: z.string().trim().min(1),
    user_turn_hash: z.string().trim().min(1),
    provider: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    if_revision: z.number().int().min(1).optional(),
  })
  .strict();

const SourceChatDraftReplyResponseSchema = z.object({
  content: z.string(),
  display: z.object({
    captured: z.array(z.string()),
    excluded: z.array(z.string()),
    needs_confirmation: z.array(z.string()),
  }),
  model: z.string(),
  provider: z.string(),
  source_items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['captured', 'excluded', 'needs_confirmation']),
      title: z.string(),
      content: z.string(),
      target_id: z.string().optional(),
      target_path: z.string().optional(),
      source_quote: z.string().optional(),
      source_turn_hash: z.string().optional(),
    })
  ),
  warnings: z.array(z.string()),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
});

const draftReplyRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/source-chat/draft-reply',
  tags: ['Workspaces'],
  summary: 'Generate a structured Source Chat assistant draft before source evidence selection',
  description:
    'Re-resolves the saved user turn and Workspace target catalog on the server, generates source-ready draft items, and returns a user-facing reply plus source_items without mutating Workspace proposal state.',
  request: {
    params: z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) }),
    body: {
      content: { 'application/json': { schema: SourceChatDraftReplyRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Generated Source Chat draft reply',
      content: {
        'application/json': { schema: SuccessResponseSchema(SourceChatDraftReplyResponseSchema) },
      },
    },
    400: {
      description: 'Invalid source selector or generation request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace, conversation, or source turn not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    502: {
      description: 'Provider unavailable',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Source Chat draft generation failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const sourceChatDraftReplyRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
const defaultInferenceRuntime = createInferenceRuntime();

function sourceChatDraftErrorResponse(c: Parameters<typeof errorResponse>[0], error: unknown) {
  if (error instanceof InferenceAdmissionDeniedError) {
    return c.json(
      { success: false as const, error: { code: 'RATE_LIMITED' as const, message: error.message } },
      429
    );
  }
  if (error instanceof SourceChatDraftReplyError) {
    if (error.kind === 'source_not_found') return errorResponse(c, 'NOT_FOUND', error.message);
    if (error.kind === 'source_project_mismatch') {
      return errorResponse(c, 'FORBIDDEN', error.message);
    }
    if (error.kind === 'provider_unavailable') {
      return c.json(
        {
          success: false as const,
          error: { code: 'PROVIDER_UNAVAILABLE', message: error.message },
        },
        502
      );
    }
    if (error.kind === 'generation_failed') {
      return errorResponse(c, 'INTERNAL_ERROR', error.message);
    }
    return errorResponse(c, 'INVALID_REQUEST', error.message);
  }
  const message = error instanceof Error ? error.message : 'Source Chat draft generation failed';
  return errorResponse(c, 'INTERNAL_ERROR', message);
}

sourceChatDraftReplyRoutes.openapi(draftReplyRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const request = c.req.valid('json');
  const db = await getDB();
  const project = await assertProjectAccess(c, db, projectId);
  if (project instanceof Response) return project;

  try {
    const created = await createSourceChatDraftReply(db, {
      projectId,
      workspaceId,
      conversationId: request.conversation_id,
      userTurnHash: request.user_turn_hash,
      expectedRevision: request.if_revision,
      provider: request.provider,
      model: request.model,
      userId: getUserId(c),
      inference: {
        runtime: getInferenceRuntime(c) ?? defaultInferenceRuntime,
        runId: resolveInferenceRunId(c),
        scope: {
          actor: resolveInferenceActor(c),
          projectId,
          ...(project.namespaceId ? { namespaceId: project.namespaceId } : {}),
          projectVisibility: 'unknown',
        },
      },
    });
    return c.json({ success: true as const, data: created }, 200);
  } catch (error) {
    return sourceChatDraftErrorResponse(c, error);
  }
});
