/**
 * L3 — imperative "load one project" helper. Pass-through to the L1
 * projects adapter.
 */

import { getProject } from '@/lib/api/projects';
import type { ProjectDetail } from '@/lib/api/types';

export function fetchProject(projectId: string): Promise<ProjectDetail> {
  return getProject(projectId);
}
