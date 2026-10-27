import { useRouter, useSearchParams } from 'next/navigation';
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
import { apiProjectToSummary, useProjectStore } from '@/store/projectStore';

export type ProjectExportKind = 'cfpack' | 'ledger';

export function projectDescription(project: Pick<ProjectDetail, 'metadata'> | null): string {
  const description = project?.metadata?.description;
  return typeof description === 'string' ? description : '';
}

export function useProjectSettings(projectId: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProject(projectId)
      .then((value) => {
        if (!cancelled) {
          setProject(value);
          useProjectStore.getState().cacheProject(apiProjectToSummary(value));
        }
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
      const updated = await updateProject(projectId, {
        metadata: { description },
        ...(name !== project?.name ? { name } : {}),
      });
      const metadata = updated.metadata;
      setProject((prev) => (prev ? { ...prev, ...updated } : prev));
      useProjectStore.getState().updateProject(projectId, {
        description,
        metadata,
        name: updated.name ?? name,
        namespace: updated.namespace,
        canonical_path: updated.canonical_path,
        path_status: updated.path_status,
      });
      if (updated.canonical_path) {
        const query = new URLSearchParams(searchParams.toString());
        // Return links to the old name are kept local to the now-current repository.
        if (query.has('returnTo')) {
          const old = project?.canonical_path;
          const value = query.get('returnTo')!;
          if (old && (value === old || value.startsWith(`${old}/`) || value.startsWith(`${old}?`)))
            query.set('returnTo', updated.canonical_path + value.slice(old.length));
        }
        router.replace(
          `${updated.canonical_path}/settings${query.size ? `?${query}` : ''}${window.location.hash}`,
          { scroll: false }
        );
      }
    },
    [project?.metadata, project?.name, project?.canonical_path, projectId, router, searchParams]
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
