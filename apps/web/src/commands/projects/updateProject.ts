/**
 * L3 command — patch a project's mutable fields.
 */

import {
  type UpdateProjectPayload,
  updateProject as updateProjectInfra,
} from '@/infrastructure/projects';
import type { Project } from '@/types/api';
import { ProjectPersistenceError } from './errors';

export async function updateProject(
  projectId: string,
  updates: UpdateProjectPayload
): Promise<Project> {
  try {
    return await updateProjectInfra(projectId, updates);
  } catch (cause) {
    throw new ProjectPersistenceError(
      cause instanceof Error ? cause.message : 'updateProject failed',
      cause
    );
  }
}

export type { UpdateProjectPayload };
