import { createHash } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type DraftYOp, DraftYOpSchema } from '@t3x-dev/application';
import type { LLMProvider } from '@t3x-dev/core';
import {
  findApiKeyById,
  findConversationById,
  findTransitionProposalByRequest,
  findWorkspaceDraft,
  insertTurn,
} from '@t3x-dev/storage';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  createInferenceRuntime,
  getInferenceRuntime,
  resolveInferenceActor,
  resolveInferenceIngressChannel,
  resolveInferenceProjectScope,
  resolveInferenceRunId,
} from '../lib/inference';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import {
  PROPOSAL_GENERATOR_ACTOR,
  proposalGenerationMembershipRequestId,
} from '../lib/proposal-generation';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import {
  requireTransitionAuthority,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
  transitionApiKey,
} from '../lib/transition-authority';
import { chatWithWorkspace } from '../lib/workspace-assistant';
import { workspaceAuthoringState } from '../lib/workspace-authoring';
import { ErrorResponseSchema } from '../schemas/common';

const Request = z
  .object({
    request_id: z.string().min(1).max(200),
    conversation_id: z.string().min(1).max(200),
    user_turn_hash: z.string().min(1).max(200),
    if_revision: z.number().int().positive(),
    source_material_ids: z.array(z.string().min(1).max(200)).max(64).default([]),
    selected_action_id: z.string().max(200).optional(),
    selected_node_id: z.string().max(1000).optional(),
    exact_edit: z
      .object({
        operations: z
          .array(
            z.unknown().superRefine((value, ctx) => {
              if (!DraftYOpSchema.safeParse(value).success)
                ctx.addIssue({ code: 'custom', message: 'Invalid exact YOp' });
            })
          )
          .min(1)
          .max(100),
        reason: z.string().max(2000).optional(),
      })
      .strict()
      .optional(),
    allow_proposal: z.boolean().default(false),
    posture: z.enum(['source_only', 'guided', 'recommend']).default('source_only'),
    provider: z.string().max(100).optional(),
    model: z.string().max(200).optional(),
  })
  .strict();
const Params = z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) });
export const workspaceAssistantRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
workspaceAssistantRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  if (
    error instanceof TransitionScopeDeniedError ||
    error instanceof TransitionProjectScopeDeniedError
  )
    return errorResponse(c, 'FORBIDDEN', error.message);
  if (error instanceof z.ZodError) return errorResponse(c, 'INVALID_REQUEST', error.message);
  if (error instanceof TypeError) return errorResponse(c, 'INVALID_REQUEST', error.message);
  throw error;
});
const defaultRuntime = createInferenceRuntime();
/** Existing Workspace source thread, its own SSE contract; global /v1/chat remains independent. */
workspaceAssistantRoutes.post(
  '/v1/projects/:projectId/workspaces/:workspaceId/source-chat/assistant/stream',
  async (c) => {
    const body = Request.parse(await c.req.json());
    const { projectId, workspaceId } = Params.parse(c.req.param());
    const db = await getDB();
    const project = await assertProjectAccess(c, db, projectId);
    if (project instanceof Response) return project;
    const principal = requireTransitionAuthority({
      apiKey: transitionApiKey(c),
      projectId,
      scope: 'transition:inspect',
    });
    if (body.exact_edit && principal.actor.kind !== 'human')
      return errorResponse(
        c,
        'FORBIDDEN',
        'Exact chat edits require a human principal; external agents use the scoped authoring command API'
      );
    const conversation = await findConversationById(db, body.conversation_id);
    if (conversation?.projectId !== projectId)
      return errorResponse(c, 'NOT_FOUND', 'Source thread not found');
    const resolved = await resolveProviderAndModel({
      db,
      projectId,
      conversationId: body.conversation_id,
      userId: getUserId(c),
      requestedProvider: body.provider,
      requestedModel: body.model,
    });
    if (!resolved.ok) return errorResponse(c, 'INVALID_REQUEST', resolved.message);
    const provider = resolved.provider as LLMProvider;
    if (typeof provider.generate !== 'function')
      return errorResponse(c, 'INVALID_REQUEST', 'Selected provider cannot chat');
    const authorize = async (capability: 'read' | 'propose') => {
      const initialCredential = transitionApiKey(c);
      if (initialCredential) {
        const currentCredential = await findApiKeyById(db, initialCredential.id);
        if (!currentCredential || currentCredential.revoked_at)
          throw new HTTPException(403, { message: 'Credential revoked' });
        requireTransitionAuthority({
          apiKey: currentCredential,
          projectId,
          scope: capability === 'read' ? 'transition:inspect' : 'transition:propose',
        });
      }
      const access = await assertProjectAccess(c, db, projectId);
      if (access instanceof Response) throw new HTTPException(403, { res: access });
      requireTransitionAuthority({
        apiKey: transitionApiKey(c),
        projectId,
        scope: capability === 'read' ? 'transition:inspect' : 'transition:propose',
      });
    };
    const operationNamespace = createHash('sha256')
      .update(
        JSON.stringify({
          actor: principal.actor,
          projectId,
          workspaceId,
          conversationId: body.conversation_id,
          requestId: body.request_id,
        })
      )
      .digest('hex');
    return streamSSE(c, async (stream) => {
      const controller = new AbortController();
      stream.onAbort(() => controller.abort());
      let content = '';
      let terminalReason = 'completed';
      const operations: unknown[] = [];
      try {
        await chatWithWorkspace({
          db,
          context: {
            projectId,
            workspaceId,
            conversationId: body.conversation_id,
            userTurnHash: body.user_turn_hash,
            expectedWorkspaceRevision: body.if_revision,
            sourceMaterialIds: body.source_material_ids,
            selectedActionId: body.selected_action_id,
            selectedNodeId: body.selected_node_id,
          },
          actor: principal.actor,
          provider,
          model: resolved.model,
          inference: {
            runtime: getInferenceRuntime(c) ?? defaultRuntime,
            runId: resolveInferenceRunId(c),
            scope: {
              actor: resolveInferenceActor(c),
              ingressChannel: resolveInferenceIngressChannel(c),
              ...resolveInferenceProjectScope(project),
            },
          },
          operationNamespace,
          authorize,
          exactEdit: body.exact_edit
            ? { ...body.exact_edit, operations: body.exact_edit.operations as DraftYOp[] }
            : undefined,
          proposal: body.allow_proposal
            ? {
                posture: body.posture,
                requestedProvider: resolved.providerId,
                requestedModel: resolved.model,
              }
            : undefined,
          signal: controller.signal,
          emit: async (event) => {
            if (event.type === 'text') content += event.content;
            if (event.type === 'operation' && event.status === 'completed') operations.push(event);
            // Done is delivered only after the final assistant turn has been persisted.
            if (event.type === 'done') {
              terminalReason = event.reason;
              return;
            }
            await stream.writeSSE({ event: 'assistant', data: JSON.stringify(event) });
          },
        });
        await authorize('read');
        const turn = content.trim()
          ? await insertTurn(db, {
              projectId,
              conversationId: body.conversation_id,
              role: 'assistant',
              content,
              rings: {
                workspace_assistant: {
                  schema: 't3x.application/workspace-assistant-transcript/v1',
                  requestId: body.request_id,
                  operations,
                  delivery: 'provider_response',
                },
              },
            })
          : null;
        await stream.writeSSE({
          event: 'assistant',
          data: JSON.stringify({
            type: 'done',
            turnHash: turn?.turnHash,
            content,
            reason: terminalReason,
          }),
        });
      } catch (error) {
        if (!controller.signal.aborted)
          await stream.writeSSE({
            event: 'assistant',
            data: JSON.stringify({
              type: 'error',
              message: error instanceof Error ? error.message : 'Workspace Assistant failed',
              recoverOperations: true,
            }),
          });
      }
    });
  }
);
const recovery = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/source-chat/assistant/operations/{operationId}',
  tags: ['Workspaces'],
  request: { params: Params.extend({ operationId: z.string().regex(/^assistant:[a-f0-9]{64}$/) }) },
  responses: {
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    200: {
      description: 'Durable proposal result, or unknown; never replays the conversation',
      content: {
        'application/json': { schema: z.object({ success: z.literal(true), data: z.unknown() }) },
      },
    },
  },
});
workspaceAssistantRoutes.openapi(recovery, async (c) => {
  const { projectId, workspaceId, operationId } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:inspect',
  });
  const workspace = await findWorkspaceDraft(db, projectId, workspaceId);
  if (workspace?.workspace_state?.authoringLedger) {
    const { ledger } = workspaceAuthoringState(workspace.workspace_state);
    const action = ledger.actions.find(
      (item) =>
        item.actionId === operationId &&
        item.actor.kind === principal.actor.kind &&
        item.actor.id === principal.actor.id
    );
    const receipt = ledger.receipts?.find((item) => item.actionId === operationId);
    if (action)
      return c.json(
        {
          success: true as const,
          data: {
            status: 'published',
            operationId,
            actionId: action.actionId,
            compositionRevision: action.afterRevision,
            workspaceRevision: workspace.revision,
          },
        },
        200
      );
    if (receipt)
      return c.json(
        {
          success: true as const,
          data: { status: 'no_change', operationId, workspaceRevision: workspace.revision },
        },
        200
      );
  }
  const proposal = await findTransitionProposalByRequest(db, {
    projectId,
    actor: PROPOSAL_GENERATOR_ACTOR,
    requestId: proposalGenerationMembershipRequestId(principal.actor, operationId),
  });
  return c.json(
    {
      success: true as const,
      data:
        proposal?.workspaceId === workspaceId
          ? {
              status: 'candidate',
              operationId,
              transitionId: proposal.transitionId,
              workspaceRevision: proposal.workspaceRevision,
            }
          : { status: 'unknown', operationId, retryAutomatically: false },
    },
    200
  );
});
