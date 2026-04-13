/**
 * L3 — project-scoped leaf read/write pass-through for canvas slices.
 *
 * `useCreateLeaf` (in hooks/) wraps `createLeaf` for component consumers;
 * slices import the plain function from here.
 */

import {
  type CreateLeafInput,
  createLeaf,
  deleteLeaf,
  listLeavesByProject,
} from '@/infrastructure/leaves';
import type { Leaf } from '@/types/api';

export function fetchLeavesByProject(projectId: string): Promise<Leaf[]> {
  return listLeavesByProject(projectId);
}

export function createLeafInProject(input: CreateLeafInput): Promise<Leaf> {
  return createLeaf(input);
}

export function deleteLeafById(leafId: string): Promise<void> {
  return deleteLeaf(leafId);
}

export type { CreateLeafInput };
