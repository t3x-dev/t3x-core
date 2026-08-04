import { type AnyDB, getTransitionRefHead } from '@t3x-dev/storage';

export async function resolveDefaultCommitParents(
  db: AnyDB,
  projectId: string,
  branch: string,
  preferredParentHash?: string
): Promise<string[]> {
  if (preferredParentHash) return [preferredParentHash];

  const branchHead = await getTransitionRefHead(db, { projectId, refName: branch });
  return branchHead.head === null ? [] : [branchHead.head];
}
