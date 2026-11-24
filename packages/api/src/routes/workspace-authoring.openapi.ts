import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { AssistantSchemaSettingsInputSchema } from '@t3x-dev/api-client';
import type { DraftDocument } from '@t3x-dev/application';
import { type DraftYOp, DraftYOpSchema, restoreDocumentOperations } from '@t3x-dev/application';
import { YOPS_STATE_CODEC_VERSION, YOPS_STATE_MEDIA_TYPE } from '@t3x-dev/core';
import {
  ConflictError,
  DraftAuthoringConflictError,
  findWorkspaceDraft,
  getVerifiedTransitionCommitGraph,
  NotFoundError,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { StudioError } from '../lib/schema-studio-preview';
import {
  requireTransitionAuthority,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
  transitionApiKey,
} from '../lib/transition-authority';
import { wireTransitionView } from '../lib/transition-control-plane/wire';
import { createAssistantSchemaSettingsService } from '../lib/workspace-assistant/schema-settings';
import {
  assertWorkspaceAuthoringCommandBasis,
  confirmWorkspaceDeletion,
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { prepareWorkspaceAuthoringReview } from '../lib/workspace-authoring-review';
import { publishWorkspaceGeneration } from '../lib/workspace-generation-publication';
import {
  decideWorkspaceReconciliation,
  prepareWorkspaceReconciliation,
  reconcileWorkspaceAuthoring,
  validateResolvedDocument,
  WorkspaceReconciliationConflictError,
  WorkspaceReconciliationValidationError,
} from '../lib/workspace-reconciliation';
import { captureWorkspaceSchema } from '../lib/workspace-schema-review';
import { ErrorResponseSchema } from '../schemas/common';

const Params = z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) });
const RefHead = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/)
  .nullable();
const Identity = z.string().trim().min(1).max(200);
const JsonValue = z.unknown().superRefine((value, context) => {
  if (!z.json().safeParse(value).success)
    context.addIssue({ code: 'custom', message: 'Expected a JSON value' });
}) as z.ZodType<DraftDocument>;
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
const restoreContent = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/content-restores',
  tags: ['Workspaces'],
  request: {
    params: Params,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({
              request_id: Identity,
              source_commit_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
              expected_workspace_revision: z.number().int().positive(),
              expected_ref_head: RefHead,
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

const publishSchema = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/schema-actions',
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
              settings: AssistantSchemaSettingsInputSchema,
              discard_studio_candidate: z.boolean().optional(),
            })
            .strict(),
        },
      },
    },
  },
  responses,
});

const reconcile = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/reconciliation',
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
            })
            .strict(),
        },
      },
    },
  },
  responses,
});

const prepareReconciliation = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/reconciliation/preparations',
  tags: ['Workspaces'],
  request: {
    params: Params,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              expected_workspace_revision: z.number().int().positive(),
              expected_ref_head: RefHead,
            })
            .strict(),
        },
      },
    },
  },
  responses,
});

const decideReconciliation = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/reconciliation/decisions',
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
              preparation_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
              action: z.enum(['adopt', 'cancel', 'discard', 'resolve']),
              resolutions: z
                .array(
                  z.discriminatedUnion('choice', [
                    z
                      .object({
                        conflict_id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
                        choice: z.enum(['base', 'ours', 'theirs']),
                      })
                      .strict(),
                    z
                      .object({
                        conflict_id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
                        choice: z.literal('custom'),
                        value: JsonValue,
                      })
                      .strict(),
                  ])
                )
                .max(1000)
                .optional(),
            })
            .strict()
            .superRefine((value, context) => {
              if (value.action === 'resolve' && !value.resolutions?.length)
                context.addIssue({
                  code: 'custom',
                  path: ['resolutions'],
                  message: 'Conflict resolution requires one choice for every conflict',
                });
              if (value.action !== 'resolve' && value.resolutions !== undefined)
                context.addIssue({
                  code: 'custom',
                  path: ['resolutions'],
                  message: 'Resolutions are accepted only for action=resolve',
                });
            }),
        },
      },
    },
  },
  responses,
});

export const workspaceAuthoringRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
workspaceAuthoringRoutes.onError((error, c) => {
  if (error instanceof WorkspaceReconciliationConflictError)
    return c.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: { preparation: error.preparation },
        },
      },
      409
    );
  if (error instanceof WorkspaceReconciliationValidationError)
    return c.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: { issues: error.issues },
        },
      },
      409
    );
  if (error instanceof ConflictError || error instanceof DraftAuthoringConflictError)
    return c.json(
      { success: false, error: { code: 'DRAFT_CONFLICT', message: error.message } },
      409
    );
  if (error instanceof NotFoundError) return errorResponse(c, 'NOT_FOUND', error.message);
  if (error instanceof StudioError)
    return errorResponse(c, error.code, error.message, error.details);
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
workspaceAuthoringRoutes.openapi(restoreContent, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const input = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:propose',
  });
  const graph = await getVerifiedTransitionCommitGraph(db, projectId, input.source_commit_digest);
  if (!graph)
    return errorResponse(c, 'COMMIT_NOT_FOUND', 'Historical Commit not found in project.');
  if (
    graph.state.codec.mediaType !== YOPS_STATE_MEDIA_TYPE ||
    graph.state.codec.version !== YOPS_STATE_CODEC_VERSION
  )
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'This State codec is unsupported by Workspace authoring.'
    );
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state)
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
  const { ledger, basis } = workspaceAuthoringState(draft.workspace_state);
  if (basis.refHead !== input.expected_ref_head)
    throw new DraftAuthoringConflictError('Workspace basis changed.');
  // Always derive from the pinned base. Initial publication requires revision zero;
  // a replay reconstructs the same request even after later edits.
  const document = graph.state.value as DraftDocument;
  const operations = restoreDocumentOperations(ledger.base, document);
  const workspace = draft.workspace_state;
  let schemaHash: string | null = null;
  let issues: WorkspaceReconciliationValidationError['issues'] = [];
  try {
    const snapshot = await captureWorkspaceSchema(db, projectId, workspace);
    schemaHash = snapshot.schemaHash;
    if (snapshot.status === 'unbound') {
      issues = [
        { code: 'SCHEMA_UNBOUND', path: '$', message: 'Bind a Schema before preparing Review.' },
      ];
    } else {
      await validateResolvedDocument(db, projectId, workspace, document, snapshot);
    }
  } catch (error) {
    if (error instanceof WorkspaceReconciliationValidationError) issues = error.issues;
    else if (error instanceof DraftAuthoringConflictError)
      issues = [{ code: 'BOUND_SCHEMA_UNAVAILABLE', path: '$', message: error.message }];
    else throw error;
  }
  const result = await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId,
    actor: principal.actor,
    channel: principal.actor.kind === 'human' ? 'manual' : 'mcp',
    actionId: input.request_id,
    expectedWorkspaceRevision: input.expected_workspace_revision,
    expectedRevision: 0,
    expectedRefHead: input.expected_ref_head,
    reason: `Restore Content from Commit ${input.source_commit_digest} (State ${graph.commit.result.digest})`,
    operations,
  });
  return c.json(
    {
      success: true as const,
      data: {
        kind: result.value.kind,
        workspaceRevision: result.draft.revision,
        compositionRevision: result.value.ledger.compositionRevision,
        sourceCommitDigest: input.source_commit_digest,
        sourceStateDigest: graph.commit.result.digest,
        schemaHash,
        issues,
        ...('action' in result.value ? { action: result.value.action } : {}),
        ...('receipt' in result.value ? { receipt: result.value.receipt } : {}),
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

workspaceAuthoringRoutes.openapi(publishSchema, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:propose',
  });
  if (principal.actor.kind !== 'human')
    return errorResponse(c, 'FORBIDDEN', 'Saving Schema to Draft requires a human principal.');
  const definition = body.settings.definition as Record<string, unknown>;
  if (
    body.settings.action === 'add_node' &&
    (definition.slots !== undefined ||
      (definition.children !== undefined && definition.children !== 'any'))
  )
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'Add a Node and each nested Node or Slot as separate confirmed Schema actions.'
    );
  await assertWorkspaceAuthoringCommandBasis(db, {
    projectId,
    workspaceId,
    expectedWorkspaceRevision: body.expected_workspace_revision,
    expectedRevision: body.expected_revision,
    expectedRefHead: body.expected_ref_head,
  });
  const service = createAssistantSchemaSettingsService(
    c,
    db,
    projectId,
    workspaceId,
    principal.actor,
    'workspace-authoring-command'
  );
  const staged = await service.show(body.settings, body.request_id);
  await service.confirm(staged.settingsId, staged.revision, staged.settings, {
    discardStudioCandidate: body.discard_studio_candidate,
  });
  await service.propose(staged.settingsId);
  const data = await service.applyToDraft(staged.settingsId);
  return c.json({ success: true as const, data }, 200);
});

workspaceAuthoringRoutes.openapi(reconcile, async (c) => {
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
  const result = await reconcileWorkspaceAuthoring(db, {
    projectId,
    workspaceId,
    actor: principal.actor,
    requestId: body.request_id,
    expectedWorkspaceRevision: body.expected_workspace_revision,
    expectedRefHead: body.expected_ref_head,
  });
  return c.json(
    { success: true as const, data: { ...result.value, workspaceRevision: result.draft.revision } },
    200
  );
});

workspaceAuthoringRoutes.openapi(prepareReconciliation, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:inspect',
  });
  const data: unknown = await prepareWorkspaceReconciliation(db, {
    projectId,
    workspaceId,
    expectedWorkspaceRevision: body.expected_workspace_revision,
    expectedRefHead: body.expected_ref_head,
  });
  return c.json({ success: true as const, data }, 200);
});

workspaceAuthoringRoutes.openapi(decideReconciliation, async (c) => {
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
  const result = await decideWorkspaceReconciliation(db, {
    projectId,
    workspaceId,
    actor: principal.actor,
    requestId: body.request_id,
    expectedWorkspaceRevision: body.expected_workspace_revision,
    expectedRefHead: body.expected_ref_head,
    preparationDigest: body.preparation_digest,
    action: body.action,
    ...(body.resolutions
      ? {
          resolutions: body.resolutions.map((resolution) =>
            resolution.choice === 'custom'
              ? {
                  conflictId: resolution.conflict_id,
                  choice: resolution.choice,
                  value: resolution.value,
                }
              : { conflictId: resolution.conflict_id, choice: resolution.choice }
          ),
        }
      : {}),
  });
  const data: unknown = { ...result.value, workspaceRevision: result.draft.revision };
  return c.json({ success: true as const, data }, 200);
});

const confirmDeletion = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/authoring/actions/{actionId}/deletion-confirmation',
  tags: ['Workspaces'],
  request: {
    params: Params.extend({ actionId: Identity }),
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              expected_workspace_revision: z.number().int().positive(),
              expected_revision: z.number().int().nonnegative(),
              expected_ref_head: RefHead,
            })
            .strict(),
        },
      },
    },
  },
  responses,
});
workspaceAuthoringRoutes.openapi(confirmDeletion, async (c) => {
  const params = c.req.valid('param');
  const body = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, params.projectId, 'project:edit');
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId: params.projectId,
    scope: 'transition:propose',
  });
  if (principal.actor.kind !== 'human')
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only a human can confirm deletion' },
      },
      403
    );
  const saved = await confirmWorkspaceDeletion(db, {
    ...params,
    actor: principal.actor,
    expectedWorkspaceRevision: body.expected_workspace_revision,
    expectedRevision: body.expected_revision,
    expectedRefHead: body.expected_ref_head,
  });
  return c.json(
    {
      success: true as const,
      data: { authorization: saved.value, workspaceRevision: saved.draft.revision },
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
