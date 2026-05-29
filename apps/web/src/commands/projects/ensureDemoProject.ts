import { ensureDemoProject as ensureDemoProjectInfra } from '@/infrastructure/projects';
import type { Project } from '@/types/api';
import { ProjectPersistenceError } from './errors';

export async function ensureDemoProject(): Promise<Project> {
  try {
    return await ensureDemoProjectInfra();
  } catch (cause) {
    throw new ProjectPersistenceError(
      cause instanceof Error ? cause.message : 'ensureDemoProject failed',
      cause
    );
  }
}
