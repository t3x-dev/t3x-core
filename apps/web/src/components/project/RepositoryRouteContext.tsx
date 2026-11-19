'use client';

import { useParams } from 'next/navigation';
import { createContext, type ReactNode, useContext } from 'react';
import type { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';
import { type UseBranchesResult, useBranches } from '@/hooks/shared/useBranches';
import {
  type UseProjectWorkspacesResult,
  useProjectWorkspaces,
} from '@/hooks/workspaces/useProjectWorkspaces';

export const RepositoryAddressContext = createContext<ReturnType<typeof useRepositoryAddress>>({
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
  children,
  projectId,
}: {
  children: ReactNode;
  projectId: string | null;
}) {
  const branches = useBranches(projectId, Boolean(projectId));
  const workspaces = useProjectWorkspaces(projectId, Boolean(projectId));
  return (
    <RepositoryViewDataContext.Provider
      value={projectId ? { projectId, branches, workspaces } : null}
    >
      {children}
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
