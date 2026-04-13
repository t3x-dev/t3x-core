/**
 * L3 — project list read (read-only per v2 §2.3).
 *
 * Writes (create, delete, update) live in @/commands/projects per
 * v2 §2.4.
 */

import { listProjects } from '@/infrastructure/projects';
import type { ProjectListData } from '@/infrastructure/types';

export function fetchProjects(limit = 50, offset = 0): Promise<ProjectListData> {
  return listProjects(limit, offset);
}
