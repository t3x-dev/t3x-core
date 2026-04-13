/**
 * L3 command — create a project.
 *
 * Wraps infra errors in ProjectPersistenceError. The original error is
 * preserved as `.cause` so the calling hook can branch on
 * `err.cause instanceof TypeError` (network failure → offline fallback).
 */

import { createProject as createProjectInfra } from '@/infrastructure/projects';
import type { Project } from '@/types/api';
import { ProjectPersistenceError } from './errors';

export async function createProject(
  name: string,
  metadata?: Record<string, unknown>
): Promise<Project> {
  try {
    return await createProjectInfra(name, metadata);
  } catch (cause) {
    throw new ProjectPersistenceError(
      cause instanceof Error ? cause.message : 'createProject failed',
      cause
    );
  }
}
