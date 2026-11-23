'use client';

import { notFound, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import {
  getProjectIdRepoPath,
  repositoryBranch,
  repositoryBranchRoute,
} from '@/domain/project/repoPath';
import {
  isRetiredRepositoryLocation,
  isSupportedRepositorySuffix,
  repositoryLocation,
} from '@/domain/project/repositoryLocation';
import { useProjectStore } from '@/store/projectStore';
import { carryRepositorySettingsReturn } from '@/utils/repositorySettingsReturn';
import { useRepositoryProjectDetail } from './ProjectDetailContext';
import { ProjectShell } from './ProjectShell';
import { resolveProjectRouteTab } from './projectTabModel';

function isProjectIndex(pathname: string): boolean {
  return /^\/project\/[^/]+\/?$/.test(pathname);
}

const DETAIL_PAGE_TITLES = new Map([
  ['changes', 'Review'],
  ['diff', 'Compare'],
  ['merge', 'Merge'],
  ['sources', 'Source evidence'],
  ['knowledge-graph', 'Knowledge graph'],
]);

export function ProjectRouteShell({
  children,
  fallbackProjectName = 'Project',
  projectId,
}: {
  children: ReactNode;
  fallbackProjectName?: string;
  projectId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { project: fetchedProject } = useRepositoryProjectDetail(projectId);
  const storedProject = useProjectStore(
    (state) => state.details?.[projectId] ?? state.projects.find((item) => item.id === projectId)
  );
  const resolvedProject =
    fetchedProject?.id === projectId ? (storedProject ?? fetchedProject) : null;
  const query = searchParams.toString();
  useEffect(() => {
    const base = getProjectIdRepoPath(projectId);
    if (!resolvedProject?.canonical_path || !(pathname === base || pathname.startsWith(`${base}/`)))
      return;
    const suffix = pathname.slice(base.length);
    if (!isSupportedRepositorySuffix(suffix)) return;
    if (suffix === '/settings') {
      carryRepositorySettingsReturn(projectId, `${resolvedProject.canonical_path}/settings`);
    }
    router.replace(
      repositoryLocation(resolvedProject.canonical_path, suffix, query, window.location.hash, base),
      { scroll: false }
    );
  }, [resolvedProject?.canonical_path, pathname, query, projectId, router]);

  const suffix = `/${pathname.split('/').slice(3).join('/')}`;
  const [, view = '', detail] = (repositoryBranchRoute(suffix)?.suffix ?? suffix).split('/');
  const pageTitle =
    view === 'checks' && detail
      ? /^(review|validation|schema|pr)-[1-9][0-9]*$/.test(detail)
        ? `Run ${detail}`
        : 'Run details'
      : view === 'history' && /^[1-9][0-9]*$/.test(detail)
        ? `Commit #${detail} · History`
        : DETAIL_PAGE_TITLES.get(view);
  if (isRetiredRepositoryLocation(suffix, searchParams)) notFound();

  // The project index already owns ProjectShell because it also controls the
  // tab content. Nested project routes use this route-level shell so the
  // shared title/navigation header never disappears during navigation.
  if (isProjectIndex(pathname)) return children;

  // Keep the known repository header while refreshing its details. Redirects
  // still use the freshly resolved project above, rather than a cached address.
  const project = resolvedProject ??
    storedProject ?? {
      id: projectId,
      name: fallbackProjectName,
      description: 'Structured state repository',
      status: 'active' as const,
      visibility: 'private' as const,
    };

  return (
    <ProjectShell
      activeTab={resolveProjectRouteTab(view || null, new URLSearchParams(query))}
      branch={
        repositoryBranch(pathname, searchParams) === 'all'
          ? null
          : repositoryBranch(pathname, searchParams)
      }
      pageTitle={resolvedProject ? pageTitle : null}
      project={project}
      projectIdNavigation={Boolean(projectId)}
    >
      {children}
    </ProjectShell>
  );
}
