import type { WorkspaceCandidate } from '@/types/workspaces';

/**
 * Resolve the current working state of a branch. Persisted candidates should
 * be checked before preview fixtures.
 */
export function selectWorkspaceForBranch(
  candidates: WorkspaceCandidate[],
  branch: string,
  headCommitHash: string | null
): WorkspaceCandidate | null {
  const branchCandidates = candidates.filter((candidate) => candidate.targetBranch === branch);
  const openWorkspace = branchCandidates.find(
    (candidate) =>
      candidate.status === 'draft' ||
      candidate.status === 'ready_for_yops' ||
      candidate.status === 'schema_review'
  );
  if (openWorkspace) return openWorkspace;
  if (!headCommitHash) return null;

  return (
    branchCandidates.find(
      (candidate) => candidate.status === 'committed' && candidate.lastCommitHash === headCommitHash
    ) ?? null
  );
}
