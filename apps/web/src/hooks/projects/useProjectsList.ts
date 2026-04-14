/**
 * useProjectsList — imperative project-list loader.
 */

import { useCallback } from 'react';
import { fetchProjects } from '@/queries/projects';

export function useProjectsList() {
  const loadProjects = useCallback(
    async (limit?: number, offset?: number) => fetchProjects(limit, offset),
    []
  );
  return { loadProjects };
}
