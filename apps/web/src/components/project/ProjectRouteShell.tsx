'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import {
  isSupportedRepositorySuffix,
  repositoryLocation,
} from '@/domain/project/repositoryLocation';
import { useProjectDetail } from '@/hooks/projects/useProjectDetail';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';
import { ProjectShell } from './ProjectShell';
import { type ProjectTabId, parseProjectTab, resolveProjectTab } from './projectTabModel';

function activeProjectTab(pathname: string, searchParams: URLSearchParams): ProjectTabId {
  if (pathname.includes('/changes/')) return 'workspaces';
  if (pathname.includes('/settings')) return 'settings';
  return resolveProjectTab(
    parseProjectTab(searchParams.get('tab')),
    searchParams.get('schemaView')
  );
}

function isProjectIndex(pathname: string): boolean {
  return /^\/project\/[^/]+\/?$/.test(pathname);
}

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
  const { loadProject } = useProjectDetail();
  const storedProject = useProjectStore(
    (state) => state.details?.[projectId] ?? state.projects.find((item) => item.id === projectId)
  );
  const [fetchedProject, setFetchedProject] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    if (!projectId) {
      setFetchedProject(null);
      return;
    }

    let cancelled = false;
    void loadProject(projectId)
      .then((project) => {
        if (!cancelled) {
          const summary = apiProjectToSummary(project);
          setFetchedProject(summary);
          useProjectStore.getState().cacheProject(summary);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchedProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProject, projectId]);

  const resolvedProject =
    fetchedProject?.id === projectId ? (storedProject ?? fetchedProject) : null;
  const query = searchParams.toString();
  useEffect(() => {
    const base = getProjectIdRepoPath(projectId);
    if (!resolvedProject?.canonical_path || !(pathname === base || pathname.startsWith(`${base}/`)))
      return;
    const suffix = pathname.slice(base.length);
    if (!isSupportedRepositorySuffix(suffix)) return;
    router.replace(
      repositoryLocation(resolvedProject.canonical_path, suffix, query, window.location.hash),
      { scroll: false }
    );
  }, [resolvedProject?.canonical_path, pathname, query, projectId, router]);

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
      activeTab={activeProjectTab(pathname, new URLSearchParams(searchParams.toString()))}
      project={project}
      projectIdNavigation={Boolean(projectId)}
    >
      {children}
    </ProjectShell>
  );
}
