'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { ProjectDetailProvider } from '@/components/project/ProjectDetailContext';
import {
  RepositoryAddressContext,
  RepositoryViewData,
  useRepositoryRouteParams,
} from '@/components/project/RepositoryRouteContext';
import { repositoryBranchRoute } from '@/domain/project/repoPath';
import { isRetiredRepositoryLocation } from '@/domain/project/repositoryLocation';
import { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';

function RepositoryLayoutContent({ children }: { children: ReactNode }) {
  const { owner, name, creating, organizationSettings } = useRepositoryRouteParams();
  const pathname = usePathname();
  const query = useSearchParams();
  const suffix = `/${pathname.split('/').slice(3).join('/')}`;
  const retired = isRetiredRepositoryLocation(suffix, query);
  const lookup = useRepositoryAddress(owner, name, !creating && !organizationSettings && !retired);
  const address = lookup.current?.address;
  const canonical = address?.canonical_path;
  const branchRoute = repositoryBranchRoute(suffix);
  const viewSuffix = branchRoute?.suffix ?? suffix.replace(/\/$/, '');
  const projectId =
    address &&
    canonical &&
    (pathname === canonical ||
      (pathname.startsWith(`${canonical}/`) &&
        (viewSuffix === '' || viewSuffix === '/state' || viewSuffix === '/schemas')))
      ? address.project_id
      : null;

  return (
    <RepositoryAddressContext.Provider value={lookup}>
      <ProjectDetailProvider projectId={address?.project_id ?? null}>
        <RepositoryViewData projectId={projectId}>{children}</RepositoryViewData>
      </ProjectDetailProvider>
    </RepositoryAddressContext.Provider>
  );
}

export default function RepositoryLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RepositoryLayoutContent>{children}</RepositoryLayoutContent>
    </Suspense>
  );
}
