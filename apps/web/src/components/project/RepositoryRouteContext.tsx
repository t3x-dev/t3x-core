'use client';

import { useParams } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';
import {
  StudioPreviewCacheContext,
  type StudioPreviewSnapshot,
} from '@/hooks/schemas/studioPreviewCache';
import { type UseBranchesResult, useBranches } from '@/hooks/shared/useBranches';
import {
  type UseProjectWorkspacesResult,
  useProjectWorkspaces,
} from '@/hooks/workspaces/useProjectWorkspaces';
import {
  WorkspaceActivityCacheContext,
  type WorkspaceActivitySnapshot,
} from '@/hooks/workspaces/workspaceActivityCache';
import type { DirectoryStateEntry } from '@/store/projectStore';

export const RepositoryAddressContext = createContext<
  ReturnType<typeof useRepositoryAddress> & { directoryStateEntry?: DirectoryStateEntry }
>({
  current: null,
  retry: () => {},
});

export function useRepositoryRouteParams() {
  const {
    owner,
    repository: name,
    repoPath,
  } = useParams<{
    owner: string;
    repository: string;
    repoPath?: string[];
  }>();
  const segments = repoPath ?? [];
  return {
    owner,
    name,
    segments,
    creating: segments.length === 0 && name.toLowerCase() === 'new',
    organizationSettings:
      segments.length === 0 &&
      owner.toLowerCase() === 't3x-dev' &&
      name.toLowerCase() === 'settings',
  };
}

const RepositoryViewDataContext = createContext<{
  projectId: string;
  branches: UseBranchesResult;
  workspaces: UseProjectWorkspacesResult;
} | null>(null);

export function RepositoryViewData({
  active,
  children,
  projectId,
}: {
  active: boolean;
  children: ReactNode;
  projectId: string | null;
}) {
  const [retainedProjectId, setRetainedProjectId] = useState<string | null>(null);
  const enabled = Boolean(projectId && (active || retainedProjectId === projectId));
  useEffect(() => {
    if (active || retainedProjectId !== projectId) setRetainedProjectId(active ? projectId : null);
  }, [active, projectId, retainedProjectId]);
  const activityCache = useMemo<{ current: WorkspaceActivitySnapshot | null }>(
    () => ({ current: null }),
    [projectId]
  );
  const studioPreviewCache = useMemo(() => {
    return projectId ? new Map<string, StudioPreviewSnapshot>() : null;
  }, [projectId]);
  const branches = useBranches(projectId, enabled);
  const workspaces = useProjectWorkspaces(projectId, enabled);
  return (
    <RepositoryViewDataContext.Provider
      value={enabled && projectId ? { projectId, branches, workspaces } : null}
    >
      <WorkspaceActivityCacheContext.Provider value={enabled ? activityCache : null}>
        <StudioPreviewCacheContext.Provider value={enabled ? studioPreviewCache : null}>
          {children}
        </StudioPreviewCacheContext.Provider>
      </WorkspaceActivityCacheContext.Provider>
    </RepositoryViewDataContext.Provider>
  );
}

export function useRepositoryBranches(projectId: string | null, enabled: boolean) {
  const context = useContext(RepositoryViewDataContext);
  const shared = context?.projectId === projectId ? context : null;
  const branches = useBranches(projectId, enabled && !shared);
  return shared?.branches ?? branches;
}

export function useRepositoryViewData(projectId: string) {
  const context = useContext(RepositoryViewDataContext);
  const shared = context?.projectId === projectId ? context : null;
  const branches = useRepositoryBranches(projectId, true);
  const workspaces = useProjectWorkspaces(projectId, !shared);
  return shared ?? { branches, workspaces };
}
