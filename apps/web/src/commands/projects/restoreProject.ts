import { restoreProject as restoreProjectInfra } from '@/infrastructure/projects';
import { ProjectPersistenceError } from './errors';

/** Restore the original repository; never create a replacement or rename it. */
export async function restoreProject(id: string) {
  try {
    return await restoreProjectInfra(id);
  } catch (cause) {
    throw new ProjectPersistenceError(
      cause instanceof Error ? cause.message : 'restoreProject failed',
      cause
    );
  }
}
