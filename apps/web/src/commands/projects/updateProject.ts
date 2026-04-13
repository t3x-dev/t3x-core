/**
 * L3 command — update a project's mutable fields.
 *
 * Thin wrapper over @/infrastructure/projects (v2 §2.4). Only live
 * consumer is the project model-settings flow.
 */

import {
  type UpdateProjectPayload,
  updateProject as updateProjectInfra,
} from '@/infrastructure/projects';
import type { Project } from '@/types/api';

export async function updateProject(
  projectId: string,
  updates: UpdateProjectPayload
): Promise<Project> {
  return updateProjectInfra(projectId, updates);
}

export type { UpdateProjectPayload };
