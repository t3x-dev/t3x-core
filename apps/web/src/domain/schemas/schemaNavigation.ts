import { safeExploreReturn } from '@/domain/project/exploreLocation';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';

export function schemaBrowseHref(projectId: string, workspace?: string, branch?: string) {
  const params = new URLSearchParams({ view: 'browse', type: 'schemas', studioTarget: projectId });
  if (branch) params.set('branch', branch);
  if (workspace) params.set('workspace', workspace);
  return `/explore?${params}`;
}

/** A source return keeps its exact release/filter, but uses the current adoption target. */
export function schemaSourceHref(
  returnTo: string | null,
  projectId: string,
  workspace?: string,
  branch?: string
) {
  const safe = safeExploreReturn(returnTo);
  if (!safe) return undefined;
  const params = new URLSearchParams(safe.split('?')[1]);
  params.set('studioTarget', projectId);
  for (const [key, value] of [
    ['workspace', workspace],
    ['branch', branch],
  ] as const) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return `/explore?${params}`;
}

export function schemaWorkspaceHref(
  pathname: string,
  query: string,
  workspace: { id: string; targetBranch: string },
  switching = false
) {
  const params = new URLSearchParams(query);
  params.set('schemaView', 'studio');
  params.set('workspace', workspace.id);
  params.set('branch', workspace.targetBranch);
  if (switching) {
    params.delete('candidate');
    params.delete('mode');
  }
  return `${pathname}?${params}`;
}

/** Schema uses the same complete, frozen Draft review in its own task context. */
export function schemaReviewHref(
  projectId: string,
  workspaceId: string,
  snapshotId: string,
  branch?: string
) {
  return `${getProjectIdRepoPath(projectId)}?${new URLSearchParams({
    tab: 'schemas',
    schemaView: 'review',
    workspace: workspaceId,
    reviewSnapshot: snapshotId,
    ...(branch ? { branch } : {}),
  })}`;
}
