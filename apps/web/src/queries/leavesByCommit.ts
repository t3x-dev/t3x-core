/**
 * L3 — imperative "list leaves attached to a commit" helper.
 */

import { listLeavesByCommit } from '@/infrastructure/leaves';
import type { Leaf } from '@/types/api';

export function fetchLeavesByCommit(commitHash: string): Promise<Leaf[]> {
  return listLeavesByCommit(commitHash);
}
