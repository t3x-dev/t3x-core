/**
 * L3 — imperative "load one project" helper. Pass-through to the L1
 * projects adapter.
 */

import { getProject } from '@/infrastructure/projects';
import type { ProjectDetail } from '@/infrastructure/types';

export function fetchProject(projectId: string): Promise<ProjectDetail> {
  return getProject(projectId);
}
