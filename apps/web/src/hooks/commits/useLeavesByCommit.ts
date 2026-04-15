/**
 * useLeavesByCommit — imperative leaves-for-commit loader.
 */

import { useCallback } from 'react';
import { fetchLeavesByCommit } from '@/queries/leavesByCommit';

export function useLeavesByCommit() {
  const loadLeaves = useCallback(async (commitHash: string) => fetchLeavesByCommit(commitHash), []);
  return { loadLeaves };
}
