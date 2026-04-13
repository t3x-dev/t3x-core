/**
 * useProjectDetail — imperative single-project loader.
 *
 * Different from `useProjects()` which backs the project-list store;
 * this is for components that need to fetch one project by id on
 * demand (detail pages, breadcrumbs, previews).
 */

import { useCallback } from 'react';
import { fetchProject } from '@/queries/project';

export function useProjectDetail() {
  const loadProject = useCallback(async (projectId: string) => fetchProject(projectId), []);
  return { loadProject };
}
