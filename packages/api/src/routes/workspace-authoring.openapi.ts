import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { DraftDocument } from '@t3x-dev/application';
import { type DraftYOp, DraftYOpSchema } from '@t3x-dev/application';
import { ConflictError, DraftAuthoringConflictError, NotFoundError } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  requireTransitionAuthority,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
  transitionApiKey,
} from '../lib/transition-authority';
import { wireTransitionView } from '../lib/transition-control-plane/wire';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
} from '../lib/workspace-authoring';
import { prepareWorkspaceAuthoringReview } from '../lib/workspace-authoring-review';
import { publishWorkspaceGeneration } from '../lib/workspace-generation-publication';
import { ErrorResponseSchema } from '../schemas/common';

const Params = z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) });
const RefHead = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/)
  .nullable();
const Identity = z.string().trim().min(1).max(200);
const Reply = z.object({ success: z.literal(true), data: z.unknown() });
const errorReply = {
  description: 'Authoring command rejected',
  content: { 'application/json': { schema: ErrorResponseSchema } },
};
const responses = {
  400: errorReply,
  403: errorReply,
  404: errorReply,
  409: errorReply,
  200: {
    description: 'Versioned authoring outcome',
    content: { 'application/json': { schema: Reply } },
  },
};
const read = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring',
  tags: ['Workspaces'],
  request: {
    params: Params,
    query: z.object({
      action_id: Identity.optional(),
      node_id: Identity.optional(),
      before_sequence: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  },
  responses,
});
const initialize = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring',
  tags: ['Workspaces'],
  request: {
    params: Params,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              request_id: Identity,
              expected_workspace_revision: z.number().int().positive(),
              expected_ref_head: RefHead,
              legacy_document: z
                .unknown()
                .superRefine((value, context) => {
                  if (value !== undefined && !z.json().safeParse(value).success)
                    context.addIssue({ code: 'custom', message: 'Expected a JSON document' });
                })
                .optional(),
            })
            .strict(),
        },
      },
    },
  },
  responses,
});
const publish = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/actions',
  tags: ['Workspaces'],
  request: {
    params: Params,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              request_id: Identity,
              expected_workspace_revision: z.number().int().positive(),
              expected_revision: z.number().int().nonnegative(),
              expected_ref_head: RefHead,
              operations: z
                .array(
                  z.unknown().superRefine((op, context) => {
                    if (
                      !DraftYOpSchema.safeParse(op).success ||
                      (op !== null && typeof op === 'object' && Object.hasOwn(op, 'source'))
                    )
                      context.addIssue({
                        code: 'custom',
                        message:
                          'Expected a native YOps operation without client-supplied source claims',
                      });
                  })
                )
                .max(1000),
              reason: z.string().trim().max(2000).optional(),
            })
            .strict(),
        },
      },
    },
  },
  responses,
});

export const workspaceAuthoringRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
workspaceAuthoringRoutes.onError((error, c) => {
  if (error instanceof ConflictError || error instanceof DraftAuthoringConflictError)
    return c.json(
      { success: false, error: { code: 'DRAFT_CONFLICT', message: error.message } },
      409
    );
  if (error instanceof NotFoundError) return errorResponse(c, 'NOT_FOUND', error.message);
  if (
    error instanceof TransitionScopeDeniedError ||
    error instanceof TransitionProjectScopeDeniedError
  )
    return errorResponse(c, 'FORBIDDEN', error.message);
  if (error instanceof TypeError) return errorResponse(c, 'INVALID_REQUEST', error.message);
  throw error;
});
workspaceAuthoringRoutes.openapi(read, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const query = c.req.valid('query');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:inspect',
  });
  const data: unknown = await readWorkspaceAuthoring(db, {
    projectId,
    workspaceId,
    actionId: query.action_id,
    nodeId: query.node_id,
    beforeSequence: query.before_sequence,
    limit: query.limit,
  });
  return c.json({ success: true as const, data }, 200);
});
workspaceAuthoringRoutes.openapi(initialize, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:propose',
  });
  const result = await initializeWorkspaceAuthoring(db, {
    projectId,
    workspaceId,
    actor: principal.actor,
    actionId: body.request_id,
    expectedWorkspaceRevision: body.expected_workspace_revision,
    expectedRefHead: body.expected_ref_head,
    legacyDocument: body.legacy_document as DraftDocument | undefined,
  });
  return c.json(
    {
      success: true as const,
      data: {
        workspaceRevision: result.draft.revision,
        compositionRevision: result.value.ledger.compositionRevision,
        basis: result.value.basis,
      },
    },
    200
  );
});
workspaceAuthoringRoutes.openapi(publish, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:propose',
  });
  const result = await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId,
    actor: principal.actor,
    channel: principal.actor.kind === 'human' ? 'manual' : 'mcp',
    actionId: body.request_id,
    expectedWorkspaceRevision: body.expected_workspace_revision,
    expectedRevision: body.expected_revision,
    expectedRefHead: body.expected_ref_head,
    operations: body.operations as DraftYOp[],
    reason: body.reason,
  });
  const outcome = result.value;
  return c.json(
    {
      success: true as const,
      data: {
        kind: outcome.kind,
        workspaceRevision: result.draft.revision,
        compositionRevision: outcome.ledger.compositionRevision,
        ...('action' in outcome ? { action: outcome.action } : {}),
        ...('receipt' in outcome ? { receipt: outcome.receipt } : {}),
      },
    },
    200
  );
});

const publishCandidate = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/candidates/{transitionId}/publication',
  tags: ['Workspaces'],
  request: {
    params: Params.extend({ transitionId: z.string().regex(/^trn_[0-9a-f]{32}$/) }),
    body: {
      content: { 'application/json': { schema: z.object({ request_id: Identity }).strict() } },
    },
  },
  responses,
});
workspaceAuthoringRoutes.openapi(publishCandidate, async (c) => {
  const { projectId, workspaceId, transitionId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:propose',
  });
  const result = await publishWorkspaceGeneration({
    db,
    projectId,
    workspaceId,
    transitionId,
    requestId: body.request_id,
    actor: principal.actor,
  });
  return c.json(
    {
      success: true as const,
      data: {
        kind: result.value.kind,
        workspaceRevision: result.draft.revision,
        compositionRevision: result.value.ledger.compositionRevision,
        ...('action' in result.value ? { action: result.value.action } : {}),
      },
    },
    200
  );
});

const review = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/reviews',
  tags: ['Workspaces'],
  request: {
    params: Params,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              request_id: Identity,
              expected_workspace_revision: z.number().int().positive(),
              expected_revision: z.number().int().nonnegative(),
              expected_ref_head: RefHead,
              reason: z.string().trim().max(2000).optional(),
            })
            .strict(),
        },
      },
    },
  },
  responses,
});
workspaceAuthoringRoutes.openapi(review, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:propose',
  });
  requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:verify',
  });
  const data = await prepareWorkspaceAuthoringReview({
    db,
    projectId,
    workspaceId,
    requestId: body.request_id,
    actor: principal.actor,
    expectedWorkspaceRevision: body.expected_workspace_revision,
    expectedRevision: body.expected_revision,
    expectedRefHead: body.expected_ref_head,
    reason: body.reason,
  });
  return c.json(
    { success: true as const, data: { ...data, view: wireTransitionView(data.view) } },
    200
  );
});
