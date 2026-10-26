/**
 * L3 command — delete a project.
 */

import {
  type DeleteProjectResponse,
  deleteProject as deleteProjectInfra,
} from '@/infrastructure/projects';
import { ProjectPersistenceError } from './errors';

export async function deleteProject(
  id: string,
  options?: { permanent?: boolean; onlyIfDeleted?: boolean }
): Promise<DeleteProjectResponse> {
  try {
    return await deleteProjectInfra(id, options);
  } catch (cause) {
    throw new ProjectPersistenceError(
      cause instanceof Error ? cause.message : 'deleteProject failed',
      cause
    );
  }
}

export type { DeleteProjectResponse };
