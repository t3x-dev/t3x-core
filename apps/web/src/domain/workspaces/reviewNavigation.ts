import { repositoryObjectHref } from '@/domain/project/objectLocation';
import { getProjectIdRepoPath, workspaceLocation } from '@/domain/project/repoPath';

/** IDs here are decoded values; encode once at the URL boundary. */
export function workspaceReviewHref(
  projectId: string,
  workspaceId: string,
  options: {
    repositoryPath?: string;
    snapshotId?: string;
    snapshotNumber?: string;
    branch?: string;
    pane?: string | null;
    mode?: 'compose' | 'review';
    tool?: 'delivery';
    returnTo?: string;
  } = {}
): string {
  const params = new URLSearchParams();
  if (!options.repositoryPath) params.set('tab', 'workspaces');
  params.set('workspace', workspaceId);
  params.set('workspaceMode', options.mode ?? 'review');
  if (options.branch) params.set('branch', options.branch);
  if (options.snapshotId) params.set('reviewSnapshot', options.snapshotId);
  if (options.pane === 'changes' || options.pane === 'rendered' || options.pane === 'yaml')
    params.set('reviewPane', options.pane);
  if (options.tool) params.set('workspaceTool', options.tool);
  if (options.returnTo) params.set('returnTo', options.returnTo);
  if (options.repositoryPath && options.snapshotNumber)
    return repositoryObjectHref(options.repositoryPath, 'reviews', options.snapshotNumber, params);
  if (options.repositoryPath)
    return workspaceLocation(options.repositoryPath, options.branch ?? null, params);
  return `${getProjectIdRepoPath(projectId)}?${params}`;
}

/** The owner/repository catch-all carries encoded path segments, unlike query params. */
export function decodeReviewRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
