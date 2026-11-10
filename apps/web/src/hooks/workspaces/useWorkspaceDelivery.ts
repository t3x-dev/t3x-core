import type { WorkspaceDeliveryInput, WorkspaceDeliveryList } from '@t3x-dev/api-client';
import { useEffect, useRef, useState } from 'react';
import {
  deployWorkspaceArtifact,
  getWorkspaceDeliveries,
  prepareWorkspaceDelivery,
  rollbackWorkspaceArtifact,
} from '@/infrastructure/workspaceDelivery';

export function useWorkspaceDelivery(projectId: string, workspaceId: string, revision?: number) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<WorkspaceDeliveryList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inflight = useRef(false);
  const retry = useRef<WorkspaceDeliveryInput | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getWorkspaceDeliveries(projectId, workspaceId)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not load delivery targets');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, workspaceId, revision, refreshKey]);

  async function deliver(targetId: string, format: 'json' | 'yaml' | 'bundle') {
    if (!data?.commitDigest || inflight.current) return;
    const previous = retry.current;
    const same =
      previous?.targetId === targetId &&
      previous.format === format &&
      previous.commitDigest === data.commitDigest &&
      previous.workspaceRevision === data.workspaceRevision;
    const input: WorkspaceDeliveryInput = same
      ? previous
      : {
          targetId,
          format,
          commitDigest: data.commitDigest,
          workspaceRevision: data.workspaceRevision,
          idempotencyKey: crypto.randomUUID(),
        };
    retry.current = input;
    inflight.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const receipt = await prepareWorkspaceDelivery(projectId, workspaceId, input);
      setData((current) =>
        current
          ? {
              ...current,
              receipts: [receipt, ...current.receipts.filter((r) => r.id !== receipt.id)].slice(
                0,
                50
              ),
            }
          : current
      );
      if (receipt.status === 'failed') {
        retry.current = { ...input, idempotencyKey: crypto.randomUUID(), retryOf: receipt.id };
        setError('File preparation failed. You can retry this attempt.');
      } else {
        setNotice('Download started. Receipt saved.');
      }
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : 'Delivery interrupted'}. Retry will reuse the same request ID.`
      );
    } finally {
      inflight.current = false;
      setPending(false);
    }
  }

  async function deploy(deliveryId: string) {
    if (inflight.current) return;
    inflight.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const deployment = await deployWorkspaceArtifact(projectId, workspaceId, {
        deliveryId,
        environment: 'preview',
        idempotencyKey: crypto.randomUUID(),
      });
      setData((current) =>
        current
          ? {
              ...current,
              deployments: [deployment, ...current.deployments],
              currentDeployment: deployment,
            }
          : current
      );
      setNotice('Preview now points to the fixed artifact.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not deploy the artifact');
    } finally {
      inflight.current = false;
      setPending(false);
    }
  }

  async function rollback(deploymentId: string) {
    if (inflight.current) return;
    inflight.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const deployment = await rollbackWorkspaceArtifact(projectId, workspaceId, {
        deploymentId,
        idempotencyKey: crypto.randomUUID(),
      });
      setData((current) =>
        current
          ? {
              ...current,
              deployments: [deployment, ...current.deployments],
              currentDeployment: deployment,
            }
          : current
      );
      setNotice('Preview rolled back to the selected fixed artifact.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not roll back the artifact');
    } finally {
      inflight.current = false;
      setPending(false);
    }
  }
  return {
    data,
    error,
    pending,
    notice,
    deliver,
    deploy,
    rollback,
    refresh: () => setRefreshKey((key) => key + 1),
  };
}
