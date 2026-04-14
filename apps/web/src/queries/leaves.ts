/**
 * L3 — leaf list reader (read-only per v2 §2.3).
 *
 * Writes (createLeaf, deleteLeaf) live in @/commands/leaves per
 * v2 §2.4.
 */

import { getLeaf, listLeavesByProject } from '@/infrastructure/leaves';
import type { Leaf } from '@/types/api';

export function fetchLeavesByProject(projectId: string): Promise<Leaf[]> {
  return listLeavesByProject(projectId);
}

export function fetchLeafById(leafId: string): Promise<Leaf> {
  return getLeaf(leafId);
}
