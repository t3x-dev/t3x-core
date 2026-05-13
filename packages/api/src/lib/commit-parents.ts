import { type AnyDB, getLatestCommit } from '@t3x-dev/storage';

export async function resolveDefaultCommitParents(
  db: AnyDB,
  projectId: string,
  branch: string,
  preferredParentHash?: string
): Promise<string[]> {
  if (preferredParentHash) return [preferredParentHash];

  const branchHead = await getLatestCommit(db, projectId, branch);
  return branchHead ? [branchHead.hash] : [];
}
