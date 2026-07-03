'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';
import {
  applyProjectWorkspaceSchemaBindings,
  type ProjectWorkspaceSchemaBindings,
} from '@/domain/workspaces/schemaBindings';
import { useProjectMaterials } from '@/hooks/materials/useProjectMaterials';

interface ProjectWorkspacesTabProps {
  projectId: string;
  schemaBindings?: ProjectWorkspaceSchemaBindings;
}

export function ProjectWorkspacesTab({ projectId, schemaBindings }: ProjectWorkspacesTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectMaterials = useProjectMaterials(projectId);
  const previewCandidates = useMemo(
    () => getWorkspacePreviewCandidates(projectId, projectMaterials.materials),
    [projectId, projectMaterials.materials]
  );
  const candidates = useMemo(
    () =>
      schemaBindings
        ? applyProjectWorkspaceSchemaBindings(previewCandidates, schemaBindings)
        : previewCandidates,
    [previewCandidates, schemaBindings]
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
