'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';
import { useProjectMaterials } from '@/hooks/materials/useProjectMaterials';

export function ProjectWorkspacesTab({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectMaterials = useProjectMaterials(projectId);
  const candidates = useMemo(
    () => getWorkspacePreviewCandidates(projectId, projectMaterials.materials),
    [projectId, projectMaterials.materials]
  );
  const selectedWorkspaceId = searchParams.get('workspace');

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'workspaces');
      params.set('workspace', workspaceId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <WorkspaceWorkbench
      candidates={candidates}
      projectId={projectId}
      selectedWorkspaceId={selectedWorkspaceId}
      onSelectedWorkspaceChange={handleWorkspaceSelect}
      onSourceMaterialUploaded={projectMaterials.refresh}
    />
  );
}
