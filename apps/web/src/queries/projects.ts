/**
 * L3 — project read/write pass-through for the project-list store.
 *
 * The chat sidebar uses its own `hooks/useProjects` hook for React-bound
 * data loading; `projectStore` (a Zustand store that backs multiple
 * canvas-level surfaces) needs an imperative surface that does not
 * involve React — this module supplies it.
 */

import { listProjects } from '@/infrastructure/projects';
import type { ProjectListData } from '@/infrastructure/types';

export function fetchProjects(limit = 50, offset = 0): Promise<ProjectListData> {
  return listProjects(limit, offset);
}
