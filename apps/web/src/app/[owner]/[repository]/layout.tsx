'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import { ProjectDetailProvider } from '@/components/project/ProjectDetailContext';
import {
  RepositoryAddressContext,
  RepositoryViewData,
  useRepositoryRouteParams,
} from '@/components/project/RepositoryRouteContext';
import { repositoryBranchRoute } from '@/domain/project/repoPath';
import { isRetiredRepositoryLocation } from '@/domain/project/repositoryLocation';
import { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { type DirectoryStateEntry, useProjectStore } from '@/store/projectStore';

function RepositoryLayoutContent({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const { owner, name, creating, organizationSettings } = useRepositoryRouteParams();
  const pathname = usePathname();
  const query = useSearchParams();
  const suffix = `/${pathname.split('/').slice(3).join('/')}`;
  const retired = isRetiredRepositoryLocation(suffix, query);
  const lookup = useRepositoryAddress(owner, name, !creating && !organizationSettings && !retired);
  const entry = useProjectStore((state) => state.directoryStateEntry);
  const queryString = query.toString();
  const incoming = useMemo(
    () =>
      entry &&
      entry.userId === userId &&
      entry.project.canonical_path === pathname &&
      !queryString &&
      entry.expiresAt > Date.now()
        ? entry
        : undefined,
    [entry, pathname, queryString, userId]
  );
  const [claimedEntry, setClaimedEntry] = useState<DirectoryStateEntry>();
  const opening =
    incoming ?? (claimedEntry?.project.canonical_path === pathname ? claimedEntry : undefined);
  useEffect(() => {
    if (incoming) {
      setClaimedEntry(incoming);
      if (useProjectStore.getState().directoryStateEntry === incoming)
        useProjectStore.setState({ directoryStateEntry: null });
    } else if (!opening && claimedEntry) {
      setClaimedEntry(undefined);
    }
  }, [claimedEntry, incoming, opening]);
  const address = lookup.current?.address;
  const addressMatchesEntry =
    address &&
    !address.redirect &&
    address.project_id === opening?.project.id &&
    address.canonical_path === pathname;
  const directoryStateEntry = addressMatchesEntry ? opening : undefined;
  const detailProjectId = address?.project_id ?? (!lookup.current ? opening?.project.id : null);
  const canonical = address?.canonical_path;
  const branchRoute = repositoryBranchRoute(suffix);
  const viewSuffix = branchRoute?.suffix ?? suffix.replace(/\/$/, '');
  const projectId =
    address && canonical && (pathname === canonical || pathname.startsWith(`${canonical}/`))
      ? address.project_id
      : null;
  const liveWorkspace =
    viewSuffix === '/workspaces' &&
    !query.get('reviewSnapshot') &&
    query.get('reviewPane') !== 'checks';
  const viewNeedsData = ['', '/state', '/schemas'].includes(viewSuffix) || liveWorkspace;

  return (
    <RepositoryAddressContext.Provider
      value={{ ...lookup, directoryStateEntry: lookup.current ? directoryStateEntry : opening }}
    >
      <ProjectDetailProvider projectId={detailProjectId ?? null}>
        <RepositoryViewData active={viewNeedsData} projectId={projectId}>
          {children}
        </RepositoryViewData>
      </ProjectDetailProvider>
    </RepositoryAddressContext.Provider>
  );
}

export default function RepositoryLayout({ children }: { children: ReactNode }) {
  const userId = useSessionUserId();
  return (
    <Suspense fallback={null}>
      <RepositoryLayoutContent key={userId} userId={userId}>
        {children}
      </RepositoryLayoutContent>
    </Suspense>
  );
}
