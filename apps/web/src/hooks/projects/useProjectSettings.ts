/**
 * useProjectSettings — repository-level settings commands for the project
 * settings page (identity edits, integrity checks, exports, deletion).
 */

import { useCallback, useEffect, useState } from 'react';
import { deleteProject } from '@/commands/projects/deleteProject';
import { updateProject } from '@/commands/projects/updateProject';
import { dispatchProjectDeleted } from '@/hooks/shared/deleteEvents';
import { exportCfpack, exportLedger } from '@/infrastructure/export';
import { verifyProjectHashChain } from '@/infrastructure/projects';
import type { ProjectDetail } from '@/infrastructure/types';
import { fetchProject } from '@/queries/project';
import { useProjectStore } from '@/store/projectStore';

export type ProjectExportKind = 'cfpack' | 'ledger';

export function projectDescription(project: Pick<ProjectDetail, 'metadata'> | null): string {
  const description = project?.metadata?.description;
  return typeof description === 'string' ? description : '';
}

export function useProjectSettings(projectId: string) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProject(projectId)
      .then((value) => {
        if (!cancelled) setProject(value);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load repository.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const saveGeneral = useCallback(
    async ({ description, name }: { description: string; name: string }) => {
      // The API replaces metadata wholesale, so unrelated keys must be carried over.
      const metadata = { ...(project?.metadata ?? {}), description };
      const updated = await updateProject(projectId, { metadata, name });
      setProject((prev) => (prev ? { ...prev, ...updated, metadata } : prev));
      useProjectStore
        .getState()
        .updateProject(projectId, { description, metadata, name: updated.name ?? name });
    },
    [project?.metadata, projectId]
  );

  const verify = useCallback(() => verifyProjectHashChain(projectId), [projectId]);

  const exportArchive = useCallback(
    (kind: ProjectExportKind) =>
      kind === 'cfpack' ? exportCfpack(projectId) : exportLedger(projectId),
    [projectId]
  );

  const remove = useCallback(async () => {
    await deleteProject(projectId);
    useProjectStore.getState().removeProject(projectId);
    dispatchProjectDeleted({ projectId });
  }, [projectId]);

  return { error, exportArchive, loading, project, remove, saveGeneral, verify };
}
