import { createHash, randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  WorkspaceDeliveryInputSchema,
  WorkspaceDeliveryListSchema,
  WorkspaceDeliveryResultSchema,
} from '@t3x-dev/api-client';
import {
  exportCommittedState,
  resolveWorkspaceDeliveryTarget,
  WORKSPACE_STATE_DOWNLOAD_TARGET,
} from '@t3x-dev/application';
import {
  findWorkspaceDelivery,
  findWorkspaceDeliveryById,
  findWorkspaceDraft,
  getVerifiedTransitionCommitGraph,
  insertWorkspaceDelivery,
  listWorkspaceDeliveries,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const workspaceDeliveryRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
const params = z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) });
const requestSchema = WorkspaceDeliveryInputSchema;
const errors = {
  400: {
    description: 'Invalid request',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  403: {
    description: 'Project access denied',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Project, workspace or commit not found',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  409: {
    description: 'Revision or idempotency mismatch',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  422: {
    description: 'Legacy target has no supported adapter',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};
const listDeliveriesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/deliveries',
  tags: ['Workspaces'],
  summary: 'List the latest 50 delivery receipts',
  request: { params },
  responses: {
    ...errors,
    200: {
      description: 'Application evidence, not deployment confirmation',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceDeliveryListSchema),
        },
      },
    },
  },
});
workspaceDeliveryRoutes.openapi(listDeliveriesRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state)
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
  const targets = Array.isArray(draft.workspace_state.outputTargets)
    ? draft.workspace_state.outputTargets
    : [];
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      success: true as const,
      data: {
        workspaceRevision: draft.revision,
        commitDigest:
          typeof draft.workspace_state.lastCommitHash === 'string'
            ? draft.workspace_state.lastCommitHash
            : null,
        targets: [
          {
            id: WORKSPACE_STATE_DOWNLOAD_TARGET,
            title: 'Committed State',
            mode: 'download' as const,
            format: 'yaml',
            reason: null,
            configurable: true,
          },
          ...targets
            .filter(
              (target) =>
                target &&
                typeof target.id === 'string' &&
                target.id !== WORKSPACE_STATE_DOWNLOAD_TARGET
            )
            .map((target) => {
              const resolved = resolveWorkspaceDeliveryTarget(target);
              return {
                id: target.id as string,
                title: typeof target.title === 'string' ? target.title : (target.id as string),
                mode: resolved.mode,
                format: typeof target.format === 'string' ? target.format : 'unknown',
                reason: resolved.mode === 'legacy' ? resolved.reason : null,
                configurable: false,
              };
            }),
        ],
        receipts: (await listWorkspaceDeliveries(db, projectId, workspaceId)).map(serializeReceipt),
      },
    },
    200
  );
});

const prepareDeliveryRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/deliveries',
  tags: ['Workspaces'],
  summary: 'Prepare an exact committed State download with an idempotent receipt',
  request: { params, body: { content: { 'application/json': { schema: requestSchema } } } },
  responses: {
    ...errors,
    200: {
      description: 'Prepared or failed attempt; browser download completion is unknown',
      content: {
        'application/json': { schema: SuccessResponseSchema(WorkspaceDeliveryResultSchema) },
      },
    },
  },
});
workspaceDeliveryRoutes.openapi(prepareDeliveryRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const input = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  c.header('Cache-Control', 'private, no-store');
  const { idempotencyKey, ...identity } = input;
  const requestDigest = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const existing = await findWorkspaceDelivery(db, projectId, workspaceId, idempotencyKey);
  if (existing && existing.requestDigest !== requestDigest)
    return errorResponse(c, 'CONFLICT', 'Idempotency key already identifies a different delivery');
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  if (!draft?.workspace_state)
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
  let attempt = 1;
  if (!existing) {
    if (
      draft.revision !== input.workspaceRevision ||
      draft.workspace_state.lastCommitHash !== input.commitDigest
    )
      return errorResponse(
        c,
        'CONFLICT',
        'Workspace changed. Refresh before preparing a new delivery.'
      );
    if (input.targetId !== WORKSPACE_STATE_DOWNLOAD_TARGET) {
      const targets = draft.workspace_state.outputTargets;
      const target = Array.isArray(targets) ? targets.find((t) => t?.id === input.targetId) : null;
      if (!target) return errorResponse(c, 'NOT_FOUND', 'Target does not belong to workspace');
      const resolved = resolveWorkspaceDeliveryTarget(target);
      if (resolved.mode !== 'download')
        return c.json(
          {
            success: false as const,
            error: { code: 'LEGACY_DELIVERY_TARGET', message: resolved.reason },
          },
          422
        );
      if (resolved.format !== input.format)
        return errorResponse(c, 'CONFLICT', 'Target format changed');
    }
    if (input.retryOf) {
      const prior = await findWorkspaceDeliveryById(db, projectId, workspaceId, input.retryOf);
      if (
        !prior ||
        prior.status !== 'failed' ||
        prior.commitDigest !== input.commitDigest ||
        prior.targetId !== input.targetId ||
        prior.format !== input.format
      )
        return errorResponse(c, 'CONFLICT', 'Retry does not match a failed delivery');
      attempt = prior.attempt + 1;
    }
  } else if (existing.status === 'failed') {
    return c.json(
      { success: true as const, data: { receipt: serializeReceipt(existing), artifact: null } },
      200
    );
  }
  // Project membership and graph integrity are verified again even on receipt replay.
  const graph = await getVerifiedTransitionCommitGraph(db, projectId, input.commitDigest);
  if (!graph) return errorResponse(c, 'COMMIT_NOT_FOUND', 'Commit not found in project');
  let artifact: ReturnType<typeof exportCommittedState> | null = null;
  try {
    artifact = exportCommittedState({
      commitDigest: input.commitDigest,
      commit: graph.commit,
      state: graph.state,
      format: input.format,
    });
  } catch {
    // Persist a fixed failure code; never put adapter exceptions or payloads in evidence.
  }
  const receipt =
    existing ??
    (await insertWorkspaceDelivery(db, {
      id: randomUUID(),
      projectId,
      workspaceId,
      targetId: input.targetId,
      commitDigest: input.commitDigest,
      idempotencyKey,
      requestDigest,
      adapter: 't3x.download/v1',
      format: input.format,
      artifactDigest: artifact?.byteDigest ?? null,
      status: artifact ? 'prepared' : 'failed',
      errorCode: artifact ? null : 'ARTIFACT_PREPARATION_FAILED',
      retryOf: input.retryOf ?? null,
      attempt,
    }));
  if (receipt.requestDigest !== requestDigest)
    return errorResponse(c, 'CONFLICT', 'Idempotency key already identifies a different delivery');
  if (receipt.status === 'prepared' && receipt.artifactDigest !== artifact?.byteDigest)
    return errorResponse(c, 'HASH_CONFLICT', 'Artifact no longer matches the recorded delivery');
  return c.json(
    {
      success: true as const,
      data: {
        receipt: serializeReceipt(receipt),
        artifact: receipt.status === 'prepared' ? artifact : null,
      },
    },
    200
  );
});

function serializeReceipt(receipt: Awaited<ReturnType<typeof insertWorkspaceDelivery>>) {
  return { ...receipt, createdAt: receipt.createdAt.toISOString() };
}
