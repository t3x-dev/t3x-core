/**
 * L3 — project read/write pass-through for the project-list store.
 *
 * The chat sidebar uses its own `hooks/useProjects` hook for React-bound
 * data loading; `projectStore` (a Zustand store that backs multiple
 * canvas-level surfaces) needs an imperative surface that does not
 * involve React — this module supplies it.
 */

import {
  type DeleteProjectResponse,
  type UpdateProjectPayload,
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from '@/lib/api/projects';
import type { ProjectListData } from '@/lib/api/types';
import type { Project } from '@/types/api';

export function fetchProjects(limit = 50, offset = 0): Promise<ProjectListData> {
  return listProjects(limit, offset);
}

export function createProjectApi(
  name: string,
  metadata?: Record<string, unknown>
): Promise<Project> {
  return createProject(name, metadata);
}

export function deleteProjectById(id: string): Promise<DeleteProjectResponse> {
  return deleteProject(id);
}

export function updateProjectById(
  projectId: string,
  updates: UpdateProjectPayload
): Promise<Project> {
  return updateProject(projectId, updates);
}

export type { DeleteProjectResponse, UpdateProjectPayload };
