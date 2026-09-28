import type { WorkspaceCandidate } from '@/types/workspaces';

export function listStudioDraftWorkspaces(workspaces: WorkspaceCandidate[]): WorkspaceCandidate[] {
  return workspaces.filter((workspace) => workspace.status !== 'committed');
}

export function resolveStudioWorkspaceId(
  workspaces: WorkspaceCandidate[],
  requestedId: string
): string {
  const drafts = listStudioDraftWorkspaces(workspaces);
  if (drafts.some((workspace) => workspace.id === requestedId)) return requestedId;
  return drafts[0]?.id ?? '';
}

/** Return one open Studio target per repository branch, followed by unbound drafts. */
export function listStudioWorkspacesForBranches(
  workspaces: WorkspaceCandidate[],
  branches: readonly string[],
  starterForBranch: (branch: string) => WorkspaceCandidate
): WorkspaceCandidate[] {
  const drafts = listStudioDraftWorkspaces(workspaces);
  const used = new Set<string>();
  const targets: WorkspaceCandidate[] = [];

  for (const branch of branches) {
    const name = branch.trim();
    if (!name) continue;
    const existing = drafts.find((workspace) => workspace.targetBranch === name);
    if (existing) {
      if (used.has(existing.id)) continue;
      targets.push(existing);
      used.add(existing.id);
      continue;
    }
    targets.push(starterForBranch(name));
  }

  for (const draft of drafts) {
    if (!used.has(draft.id)) targets.push(draft);
  }
  return targets;
}
