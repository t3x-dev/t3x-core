import { createHash } from 'node:crypto';
import {
  T3xApiError,
  WorkspaceDeliveryInputSchema,
  WorkspaceDeploymentInputSchema,
  WorkspaceRollbackInputSchema,
} from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier, isSafeWorkspaceIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

export const workspaceDeliveryDef: ToolDef = {
  name: 't3x_workspace_delivery',
  description:
    'List delivery targets and receipts for an owned Workspace prepare its portable artifact, assign a receipt to preview, or roll back to a recorded preview deployment.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'prepare', 'deploy', 'rollback'] },
      project_id: { type: 'string' },
      workspace_id: { type: 'string' },
      workspace_revision: { type: 'integer', minimum: 1, description: 'Required for prepare.' },
      commit_digest: {
        type: 'string',
        description: 'Exact last committed digest, required for prepare.',
      },
      environment: {
        type: 'string',
        enum: ['preview'],
        description: 'Deployment slot. Defaults to preview.',
      },
      delivery_id: {
        type: 'string',
        format: 'uuid',
        description: 'Prepared portable receipt for deploy.',
      },
      deployment_id: {
        type: 'string',
        format: 'uuid',
        description: 'Historical preview deployment for rollback.',
      },
      request_id: {
        type: 'string',
        format: 'uuid',
        description: 'Reuse the original UUID and inputs to replay a write.',
      },
    },
    required: ['action', 'project_id', 'workspace_id'],
  },
  annotations: { idempotentHint: true },
};
export const workspaceDeliveryHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { action, project_id, workspace_id } = args;
    if (!isSafeBusinessIdentifier(project_id) || !isSafeWorkspaceIdentifier(workspace_id))
      throw new T3xApiError('INVALID_ARGUMENT', 'Provide project_id and workspace_id.', 400);
    if (action === 'list') {
      const { workspaceRevision, commitDigest, targets, receipts, deployments, currentDeployment } =
        await client.listWorkspaceDeliveries(project_id, workspace_id);
      if (receipts.some((r) => r.projectId !== project_id || r.workspaceId !== workspace_id))
        throw new T3xApiError('INVALID_RESPONSE', 'Unexpected receipt scope.', 502);
      return {
        workspace_revision: workspaceRevision,
        commit_digest: commitDigest,
        targets,
        receipts,
        deployments: deployments.filter(
          (d) =>
            d.environment === 'preview' &&
            d.projectId === project_id &&
            d.workspaceId === workspace_id
        ),
        current_deployment: currentDeployment,
      };
    }
    if (action === 'deploy' || action === 'rollback') {
      const environment = args.environment === undefined ? 'preview' : args.environment;
      if (environment !== 'preview')
        throw new T3xApiError('INVALID_ARGUMENT', 'Only the preview slot is supported.', 400);
      const key = args.request_id;
      if (action === 'deploy') {
        const input = WorkspaceDeploymentInputSchema.safeParse({
          deliveryId: args.delivery_id,
          environment,
          idempotencyKey: key,
        });
        if (!input.success)
          throw new T3xApiError(
            'INVALID_ARGUMENT',
            'Provide delivery_id and request_id UUIDs.',
            400
          );
        return client.deployWorkspaceArtifact(project_id, workspace_id, input.data);
      }
      const input = WorkspaceRollbackInputSchema.safeParse({
        deploymentId: args.deployment_id,
        environment,
        idempotencyKey: key,
      });
      if (!input.success)
        throw new T3xApiError(
          'INVALID_ARGUMENT',
          'Provide deployment_id and request_id UUIDs.',
          400
        );
      return client.rollbackWorkspaceArtifact(project_id, workspace_id, input.data);
    }
    const input = WorkspaceDeliveryInputSchema.safeParse({
      targetId: 't3x:portable-artifact',
      format: 'bundle',
      workspaceRevision: args.workspace_revision,
      commitDigest: args.commit_digest,
      idempotencyKey: args.request_id,
    });
    if (action !== 'prepare' || !input.success)
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Preparation requires a Workspace revision, exact Commit digest and UUID request_id.',
        400
      );
    const { artifact, receipt } = await client.prepareWorkspaceDelivery(
      project_id,
      workspace_id,
      input.data
    );
    if (
      receipt.projectId !== project_id ||
      receipt.workspaceId !== workspace_id ||
      receipt.commitDigest !== input.data.commitDigest ||
      receipt.targetId !== input.data.targetId ||
      receipt.idempotencyKey !== input.data.idempotencyKey ||
      receipt.adapter !== 't3x.portable/v1' ||
      receipt.format !== 'bundle'
    )
      throw new T3xApiError('INVALID_RESPONSE', 'Receipt does not match this preparation.', 502);
    if (
      receipt.status === 'prepared'
        ? !artifact ||
          artifact.format !== 'bundle' ||
          artifact.sourceCommit.digest !== receipt.commitDigest ||
          artifact.byteLength !== Buffer.byteLength(artifact.content) ||
          artifact.byteDigest !== receipt.artifactDigest ||
          artifact.byteDigest !==
            'sha256:' + createHash('sha256').update(artifact.content).digest('hex')
        : artifact !== null || receipt.artifactDigest !== null
    )
      throw new T3xApiError(
        'INVALID_RESPONSE',
        'Portable artifact does not match its receipt.',
        502
      );
    return { receipt, artifact };
  });
