import { createHash, randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  WorkspaceDeliveryInputSchema,
  WorkspaceDeliveryListSchema,
  WorkspaceDeliveryResultSchema,
  WorkspaceDeploymentInputSchema,
  WorkspaceDeploymentResultSchema,
  WorkspaceRollbackInputSchema,
} from '@t3x-dev/api-client';
import {
  exportCommittedState,
  exportPortableArtifact,
  resolveWorkspaceDeliveryTarget,
  WORKSPACE_PORTABLE_ARTIFACT_TARGET,
  WORKSPACE_STATE_DOWNLOAD_TARGET,
} from '@t3x-dev/application';
import {
  findWorkspaceDelivery,
  findWorkspaceDeliveryById,
  findWorkspaceDeployment,
  findWorkspaceDeploymentById,
  findWorkspaceDraft,
  getVerifiedTransitionCommitGraph,
  insertWorkspaceDelivery,
  insertWorkspaceDeployment,
  listWorkspaceDeliveries,
  listWorkspaceDeployments,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  committedWorkspaceSchemaAtHead,
  unboundWorkspaceSchema,
} from '../lib/workspace-schema-review';
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
          {
            id: WORKSPACE_PORTABLE_ARTIFACT_TARGET,
            title: 'Portable artifact',
            mode: 'download' as const,
            format: 'bundle',
            reason: null,
            configurable: false,
          },
          ...targets
            .filter(
              (target) =>
                target &&
                typeof target.id === 'string' &&
                target.id !== WORKSPACE_STATE_DOWNLOAD_TARGET &&
                target.id !== WORKSPACE_PORTABLE_ARTIFACT_TARGET
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
        deployments: (await listWorkspaceDeployments(db, projectId, workspaceId)).map(
          serializeDeployment
        ),
        currentDeployment: serializeDeployment(
          (await listWorkspaceDeployments(db, projectId, workspaceId, 'preview'))[0] ?? null
        ),
      },
    },
    200
  );
});

const deployRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/deployments',
  tags: ['Workspaces'],
  summary: 'Assign a prepared portable artifact to a fixed deployment slot',
  request: {
    params,
    body: { content: { 'application/json': { schema: WorkspaceDeploymentInputSchema } } },
  },
  responses: {
    ...errors,
    200: {
      description: 'Append-only desired and actual fixed artifact assignment',
      content: {
        'application/json': { schema: SuccessResponseSchema(WorkspaceDeploymentResultSchema) },
      },
    },
  },
});
workspaceDeliveryRoutes.openapi(deployRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const input = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  c.header('Cache-Control', 'private, no-store');
  const requestDigest = createHash('sha256')
    .update(JSON.stringify({ deliveryId: input.deliveryId, environment: input.environment }))
    .digest('hex');
  const existing = await findWorkspaceDeployment(
    db,
    projectId,
    workspaceId,
    input.environment,
    input.idempotencyKey
  );
  if (existing?.requestDigest !== undefined && existing.requestDigest !== requestDigest)
    return errorResponse(c, 'CONFLICT', 'Idempotency key identifies another deployment');
  const receipt = await findWorkspaceDeliveryById(db, projectId, workspaceId, input.deliveryId);
  if (
    !receipt ||
    receipt.status !== 'prepared' ||
    receipt.adapter !== 't3x.portable/v1' ||
    receipt.format !== 'bundle' ||
    !receipt.artifactDigest
  )
    return errorResponse(c, 'NOT_FOUND', 'Prepared portable artifact not found');
  const current = (
    await listWorkspaceDeployments(db, projectId, workspaceId, input.environment)
  )[0];
  const deployment =
    existing ??
    (await insertWorkspaceDeployment(db, {
      id: randomUUID(),
      projectId,
      workspaceId,
      environment: input.environment,
      kind: 'deploy',
      deliveryId: receipt.id,
      artifactDigest: receipt.artifactDigest,
      previousArtifactDigest: current?.actualArtifactDigest ?? null,
      idempotencyKey: input.idempotencyKey,
      requestDigest,
      adapter: 't3x.fixed-slot/v1',
      desiredArtifactDigest: receipt.artifactDigest,
      actualArtifactDigest: receipt.artifactDigest,
    }));
  if (deployment.requestDigest !== requestDigest)
    return errorResponse(c, 'CONFLICT', 'Idempotency key identifies another deployment');
  return c.json(
    { success: true as const, data: { deployment: serializeDeployment(deployment) } },
    200
  );
});

const rollbackRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/deployments/rollback',
  tags: ['Workspaces'],
  summary: 'Roll a deployment slot back to an earlier fixed artifact',
  request: {
    params,
    body: { content: { 'application/json': { schema: WorkspaceRollbackInputSchema } } },
  },
  responses: {
    ...errors,
    200: {
      description: 'Append-only rollback assignment',
      content: {
        'application/json': { schema: SuccessResponseSchema(WorkspaceDeploymentResultSchema) },
      },
    },
  },
});
workspaceDeliveryRoutes.openapi(rollbackRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const input = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  c.header('Cache-Control', 'private, no-store');
  const target = await findWorkspaceDeploymentById(db, projectId, workspaceId, input.deploymentId);
  if (!target) return errorResponse(c, 'NOT_FOUND', 'Deployment version not found');
  const requestDigest = createHash('sha256')
    .update(JSON.stringify({ deploymentId: input.deploymentId }))
    .digest('hex');
  const existing = await findWorkspaceDeployment(
    db,
    projectId,
    workspaceId,
    target.environment,
    input.idempotencyKey
  );
  if (existing?.requestDigest !== undefined && existing.requestDigest !== requestDigest)
    return errorResponse(c, 'CONFLICT', 'Idempotency key identifies another rollback');
  const current = (
    await listWorkspaceDeployments(db, projectId, workspaceId, target.environment)
  )[0];
  if (!existing && current?.actualArtifactDigest === target.actualArtifactDigest)
    return errorResponse(c, 'CONFLICT', 'The selected artifact is already deployed');
  const deployment =
    existing ??
    (await insertWorkspaceDeployment(db, {
      id: randomUUID(),
      projectId,
      workspaceId,
      environment: target.environment,
      kind: 'rollback',
      deliveryId: target.deliveryId,
      artifactDigest: target.actualArtifactDigest,
      previousArtifactDigest: current?.actualArtifactDigest ?? null,
      idempotencyKey: input.idempotencyKey,
      requestDigest,
      adapter: 't3x.fixed-slot/v1',
      desiredArtifactDigest: target.actualArtifactDigest,
      actualArtifactDigest: target.actualArtifactDigest,
    }));
  if (deployment.requestDigest !== requestDigest)
    return errorResponse(c, 'CONFLICT', 'Idempotency key identifies another rollback');
  return c.json(
    { success: true as const, data: { deployment: serializeDeployment(deployment) } },
    200
  );
});

const prepareDeliveryRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/deliveries',
  tags: ['Workspaces'],
  summary: 'Prepare an exact committed artifact with an idempotent receipt',
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
    if (input.targetId === WORKSPACE_PORTABLE_ARTIFACT_TARGET) {
      if (input.format !== 'bundle')
        return errorResponse(c, 'CONFLICT', 'Portable artifact format changed');
    } else if (input.targetId === WORKSPACE_STATE_DOWNLOAD_TARGET) {
      if (input.format === 'bundle')
        return errorResponse(c, 'CONFLICT', 'Committed State format changed');
    } else {
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
  let artifact:
    | ReturnType<typeof exportCommittedState>
    | Awaited<ReturnType<typeof exportPortableArtifact>>
    | null = null;
  try {
    artifact =
      input.targetId === WORKSPACE_PORTABLE_ARTIFACT_TARGET
        ? await exportPortableArtifact({
            commitDigest: input.commitDigest,
            commit: graph.commit,
            state: graph.state,
            schema: await committedWorkspaceSchemaAtHead(
              db,
              projectId,
              draft.target_branch?.trim() || 'main',
              input.commitDigest,
              unboundWorkspaceSchema()
            ),
          })
        : exportCommittedState({
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
      adapter:
        input.targetId === WORKSPACE_PORTABLE_ARTIFACT_TARGET
          ? 't3x.portable/v1'
          : 't3x.download/v1',
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

function serializeDeployment(
  deployment: Awaited<ReturnType<typeof insertWorkspaceDeployment>> | null
) {
  return deployment ? { ...deployment, createdAt: deployment.createdAt.toISOString() } : null;
}
