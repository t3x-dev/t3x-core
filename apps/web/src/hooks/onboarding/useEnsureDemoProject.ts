import { DEMO_WORKSPACE_FIXTURE } from '@t3x-dev/core';
import { useCallback } from 'react';
import { ensureDemoProject } from '@/commands/projects';
import { fetchProjects } from '@/queries/projects';
import type { Project } from '@/types/api';

export function isDemoWorkspaceProject(project: Project): boolean {
  const metadata = project.metadata ?? {};
  return (
    metadata.demo_fixture_id === DEMO_WORKSPACE_FIXTURE.id ||
    (metadata.is_demo === true && project.name === DEMO_WORKSPACE_FIXTURE.project.name)
  );
}

export async function getOrCreateDemoProject(): Promise<Project> {
  const { projects } = await fetchProjects(50, 0);
  return projects.find(isDemoWorkspaceProject) ?? (await ensureDemoProject());
}

export function useEnsureDemoProject() {
  return useCallback(() => getOrCreateDemoProject(), []);
}
