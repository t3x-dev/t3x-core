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
