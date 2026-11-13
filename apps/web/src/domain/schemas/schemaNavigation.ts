import { exploreListHref, safeExploreReturn } from '@/domain/project/exploreLocation';
import { workspaceReviewHref } from '@/domain/workspaces/reviewNavigation';

export function schemaBrowseHref(projectId: string, workspace?: string, branch?: string) {
  const params = new URLSearchParams({ type: 'schemas', studioTarget: projectId });
  if (branch) params.set('branch', branch);
  if (workspace) params.set('workspace', workspace);
  return exploreListHref('browse', params);
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
  const target = new URL(safe, 'http://local');
  const params = target.searchParams;
  params.set('studioTarget', projectId);
  for (const [key, value] of [
    ['workspace', workspace],
    ['branch', branch],
  ] as const) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return `${target.pathname}?${params}${target.hash}`;
}

export function schemaWorkspaceHref(
  pathname: string,
  query: string,
  workspace: { id: string; targetBranch: string },
  switching = false
) {
  const params = new URLSearchParams(query);
  params.delete('schemaView');
  params.set('workspace', workspace.id);
  params.set('branch', workspace.targetBranch);
  if (switching) {
    params.delete('candidate');
    params.delete('mode');
  }
  return `${pathname}?${params}`;
}

/** All Schema review entry points use the shared Workspace workbench. */
export function schemaReviewHref(
  projectId: string,
  workspaceId: string,
  snapshotId?: string,
  branch?: string
) {
  return workspaceReviewHref(projectId, workspaceId, { snapshotId, branch });
}
