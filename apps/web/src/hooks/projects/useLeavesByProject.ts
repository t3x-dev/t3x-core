/**
 * useLeavesByProject — imperative project-leaves loader.
 */

import { useCallback } from 'react';
import { fetchLeavesByProject } from '@/queries/leaves';

export function useLeavesByProject() {
  const loadLeaves = useCallback(async (projectId: string) => fetchLeavesByProject(projectId), []);
  return { loadLeaves };
}
