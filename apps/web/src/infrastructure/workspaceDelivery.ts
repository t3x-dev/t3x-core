import {
  type WorkspaceDeliveryInput,
  WorkspaceDeliveryListSchema,
  WorkspaceDeliveryResultSchema,
} from '@t3x-dev/api-client';
import { API_V1, fetchWithTimeout, handleResponse } from './core';
import { downloadStateExport, verifyStateExport } from './stateExport';

function path(projectId: string, workspaceId: string) {
  return `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/deliveries`;
}
export async function getWorkspaceDeliveries(projectId: string, workspaceId: string) {
  return WorkspaceDeliveryListSchema.parse(
    await handleResponse(await fetchWithTimeout(path(projectId, workspaceId)))
  );
}
export async function prepareWorkspaceDelivery(
  projectId: string,
  workspaceId: string,
  input: WorkspaceDeliveryInput
) {
  const result = WorkspaceDeliveryResultSchema.parse(
    await handleResponse(
      await fetchWithTimeout(path(projectId, workspaceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    )
  );
  if (
    result.receipt.projectId !== projectId ||
    result.receipt.workspaceId !== workspaceId ||
    result.receipt.commitDigest !== input.commitDigest ||
    result.receipt.targetId !== input.targetId ||
    result.receipt.format !== input.format ||
    result.receipt.idempotencyKey !== input.idempotencyKey
  )
    throw new Error('Delivery receipt does not match the request');
  if (result.receipt.status === 'prepared') {
    if (!result.artifact || result.artifact.byteDigest !== result.receipt.artifactDigest)
      throw new Error('Delivery artifact does not match its receipt');
    await verifyStateExport(result.artifact, input.commitDigest, input.format);
    downloadStateExport(result.artifact);
  }
  return result.receipt;
}
