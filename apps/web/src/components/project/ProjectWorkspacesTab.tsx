'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';

export function ProjectWorkspacesTab({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const candidates = getWorkspacePreviewCandidates(projectId);
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
    />
  );
}
