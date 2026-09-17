import type { WorkspaceCandidate } from '@/types/workspaces';

export function listStudioDraftWorkspaces(
  workspaces: WorkspaceCandidate[]
): WorkspaceCandidate[] {
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

export function studioApplyCandidateIds(
  items: Array<{ available: boolean; id: string; kind: string | null }>
): string[] {
  const available = items.filter((item) => item.available);
  const schemas = available.filter((item) => item.kind === 'schema');
  if (schemas.length > 0) return [schemas[0]!.id];
  return available.map((item) => item.id);
}

export function workspaceHasSchemaBinding(workspace: {
  schemaBindings: readonly unknown[];
}): boolean {
  return workspace.schemaBindings.length > 0;
}
