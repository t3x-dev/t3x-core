import type { WorkspaceCandidate } from '@/types/workspaces';

export function listStudioDraftWorkspaces(workspaces: WorkspaceCandidate[]): WorkspaceCandidate[] {
  return workspaces.filter((workspace) => workspace.status !== 'committed');
}

export function resolveStudioWorkspaceId(
  workspaces: WorkspaceCandidate[],
  requestedId: string,
  branch?: string | null
): string {
  const drafts = listStudioDraftWorkspaces(workspaces);
  // Explicit targets must never silently fall back to a different Workspace.
  if (requestedId) return requestedId;
  if (branch) return drafts.find((workspace) => workspace.targetBranch === branch)?.id ?? '';
  return drafts[0]?.id ?? '';
}

/** One open draft per branch. A branch with no saved draft gets a starter. */
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
