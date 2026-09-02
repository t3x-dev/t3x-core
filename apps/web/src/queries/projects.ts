/**
 * L3 — project list read (read-only per v2 §2.3).
 *
 * Writes (create, delete, update) live in @/commands/projects per
 * v2 §2.4.
 */

import { getProject, listProjects } from '@/infrastructure/projects';
import type { ProjectDetail, ProjectListData } from '@/infrastructure/types';

export function fetchProject(projectId: string): Promise<ProjectDetail> {
  return getProject(projectId);
}

export function fetchProjects(
  limit = 50,
  offset = 0,
  namespace?: string
): Promise<ProjectListData> {
  return listProjects(limit, offset, namespace);
}
