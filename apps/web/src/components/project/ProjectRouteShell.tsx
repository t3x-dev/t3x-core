'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useProjectDetail } from '@/hooks/projects/useProjectDetail';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';
import { ProjectShell } from './ProjectShell';
import { type ProjectTabId, parseProjectTab } from './projectTabModel';

function activeProjectTab(pathname: string, searchParams: URLSearchParams): ProjectTabId {
  if (pathname.includes('/changes/')) return 'workspaces';
  if (pathname.includes('/settings')) return 'settings';
  return parseProjectTab(searchParams.get('tab'));
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
  const searchParams = useSearchParams();
  const { loadProject } = useProjectDetail();
  const storedProject = useProjectStore((state) =>
    state.projects.find((item) => item.id === projectId)
  );
  const [fetchedProject, setFetchedProject] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    if (storedProject || !projectId) {
      setFetchedProject(null);
      return;
    }

    let cancelled = false;
    void loadProject(projectId)
      .then((project) => {
        if (!cancelled) setFetchedProject(apiProjectToSummary(project));
      })
      .catch(() => {
        if (!cancelled) setFetchedProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProject, projectId, storedProject]);

  // The project index already owns ProjectShell because it also controls the
  // tab content. Nested project routes use this route-level shell so the
  // shared title/navigation header never disappears during navigation.
  if (isProjectIndex(pathname)) return children;

  const project = storedProject ??
    fetchedProject ?? {
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
