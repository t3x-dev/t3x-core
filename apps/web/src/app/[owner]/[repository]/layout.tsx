'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ProjectDetailProvider,
  useRepositoryProjectDetail,
} from '@/components/project/ProjectDetailContext';
import type { ProjectShellProject } from '@/components/project/ProjectShell';
import { ProjectShell, ProjectShellLayoutContext } from '@/components/project/ProjectShell';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  resolveProjectRouteTab,
} from '@/components/project/projectTabModel';
import {
  RepositoryAddressContext,
  RepositoryViewData,
  useRepositoryRouteParams,
} from '@/components/project/RepositoryRouteContext';
import { repositoryBranch, repositoryBranchRoute } from '@/domain/project/repoPath';
import { isRetiredRepositoryLocation } from '@/domain/project/repositoryLocation';
import { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';
import { useSessionReadEpoch, useSessionUserId } from '@/hooks/shared/useSession';
import { type DirectoryStateEntry, useProjectStore } from '@/store/projectStore';
import { ensureSettingsNavigationTiming, markNavigationTiming } from '@/utils/navigationTiming';

function RepositoryNavigationShell({
  children,
  project,
  view,
  pathname,
  query,
}: {
  children: ReactNode;
  project: ProjectShellProject & { id: string };
  view: string;
  pathname: string;
  query: URLSearchParams;
}) {
  const detail = useRepositoryProjectDetail(project.id);
  const storedProject = useProjectStore(
    (state) => state.details[project.id] ?? state.projects.find((item) => item.id === project.id)
  );
  if (detail.error) return children;

  const activeTab = resolveProjectRouteTab(view || null, query);
  const summary = storedProject ?? detail.project;
  return (
    <ProjectShell
      activeTab={activeTab}
      branch={repositoryBranch(pathname, query)}
      hideUnknownVisibility
      immersive={
        activeTab === 'schemas' || (activeTab === 'browse' && query.get('schemaView') === 'release')
      }
      pageTitle={null}
      project={
        summary?.canonical_path === project.canonical_path ? { ...project, ...summary } : project
      }
      workspaceId={query.get('workspace')}
    >
      <ProjectShellLayoutContext.Provider value>{children}</ProjectShellLayoutContext.Provider>
    </ProjectShell>
  );
}

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
  const settings = !organizationSettings && !retired && suffix.replace(/\/$/, '') === '/settings';
  useEffect(() => {
    if (settings) ensureSettingsNavigationTiming();
  }, [settings, pathname]);
  const entry = useProjectStore((state) => state.directoryStateEntry);
  const readEpoch = useSessionReadEpoch();
  const queryString = query.toString();
  const incoming = useMemo(
    () =>
      entry &&
      entry.userId === userId &&
      entry.readEpoch === readEpoch &&
      entry.project.canonical_path === pathname &&
      !queryString &&
      entry.expiresAt > Date.now()
        ? entry
        : undefined,
    [entry, pathname, queryString, userId, readEpoch]
  );
  const [claimedEntry, setClaimedEntry] = useState<DirectoryStateEntry>();
  const opening =
    incoming ??
    (claimedEntry?.project.canonical_path === pathname && claimedEntry.readEpoch === readEpoch
      ? claimedEntry
      : undefined);
  useEffect(() => {
    if (incoming) {
      setClaimedEntry(incoming);
      if (useProjectStore.getState().directoryStateEntry === incoming)
        useProjectStore.setState({ directoryStateEntry: null });
    } else if (!opening && claimedEntry) {
      setClaimedEntry(undefined);
    }
  }, [claimedEntry, incoming, opening]);
  const lookup = useRepositoryAddress(
    owner,
    name,
    !creating && !organizationSettings && !retired,
    opening?.address
  );
  const address = lookup.current?.address;
  useEffect(() => {
    if (settings && address && !address.redirect) markNavigationTiming('settings', 'address');
  }, [settings, address]);
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
  const earlySchemaRead =
    viewSuffix === '/schemas' &&
    !address?.redirect &&
    !query.has('candidate') &&
    query.get('schemaView') !== 'review';
  const view = viewSuffix.slice(1);
  const hasProjectTab = !view || PROJECT_TABS.some((tab) => getProjectTabSegment(tab.id) === view);
  const navigationProject =
    hasProjectTab && !creating && !organizationSettings && !retired
      ? address && projectId && !address.redirect
        ? {
            id: projectId,
            name: address.name,
            namespace: address.namespace,
            canonical_path: address.canonical_path,
            path_status: address.path_status,
          }
        : !lookup.current
          ? opening?.project
          : undefined
      : undefined;

  return (
    <RepositoryAddressContext.Provider
      value={{ ...lookup, directoryStateEntry: lookup.current ? directoryStateEntry : opening }}
    >
      <ProjectDetailProvider projectId={detailProjectId ?? null} settings={settings}>
        <RepositoryViewData
          active={viewNeedsData}
          projectId={projectId}
          schemaBranch={
            earlySchemaRead ? (repositoryBranch(pathname, query) ?? undefined) : undefined
          }
          schemaWorkspaceId={earlySchemaRead ? (query.get('workspace') ?? undefined) : undefined}
        >
          {navigationProject ? (
            <RepositoryNavigationShell
              project={navigationProject}
              view={view}
              pathname={pathname}
              query={new URLSearchParams(queryString)}
            >
              {children}
            </RepositoryNavigationShell>
          ) : (
            children
          )}
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
