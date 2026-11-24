import { useRouter, useSearchParams } from 'next/navigation';
/**
 * useProjectSettings — repository-level settings commands for the project
 * settings page (identity edits, integrity checks, exports, deletion).
 */

import { useCallback } from 'react';
import { deleteProject } from '@/commands/projects/deleteProject';
import { updateProject } from '@/commands/projects/updateProject';
import { useRepositoryProjectDetail } from '@/hooks/projects/useProjectDetail';
import { dispatchProjectDeleted } from '@/hooks/shared/deleteEvents';
import { exportCfpack, exportLedger } from '@/infrastructure/export';
import { verifyProjectHashChain } from '@/infrastructure/projects';
import type { ProjectDetail } from '@/infrastructure/types';
import { useProjectStore } from '@/store/projectStore';
import { carryRepositorySettingsReturn } from '@/utils/repositorySettingsReturn';

export type ProjectExportKind = 'cfpack' | 'ledger';

export function projectDescription(project: Pick<ProjectDetail, 'metadata'> | null): string {
  const description = project?.metadata?.description;
  return typeof description === 'string' ? description : '';
}

export function useProjectSettings(projectId: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { detail: project, loading, error, updateDetail } = useRepositoryProjectDetail(projectId);

  const saveGeneral = useCallback(
    async ({ description, name }: { description: string; name: string }) => {
      const updated = await updateProject(projectId, {
        metadata: { description },
        ...(name !== project?.name ? { name } : {}),
      });
      const metadata = updated.metadata;
      updateDetail(updated);
      useProjectStore.getState().updateProject(projectId, {
        description: typeof metadata?.description === 'string' ? metadata.description : description,
        metadata,
        name: updated.name ?? name,
        namespace: updated.namespace,
        canonical_path: updated.canonical_path,
        path_status: updated.path_status,
      });
      if (updated.canonical_path) {
        const pathname = `${updated.canonical_path}/settings`;
        if (pathname !== window.location.pathname) {
          const query = searchParams.toString();
          carryRepositorySettingsReturn(projectId, pathname);
          router.replace(`${pathname}${query ? `?${query}` : ''}${window.location.hash}`, {
            scroll: false,
          });
        }
      }
    },
    [project?.name, projectId, router, searchParams, updateDetail]
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

  return {
    error: error?.message ?? null,
    exportArchive,
    loading,
    project,
    remove,
    saveGeneral,
    verify,
  };
}
