export const DEFAULT_OWNER_SLUG = 't3x-dev';

export function getDeletedRepositoriesPath(namespace?: string | null): string {
  return `/${namespace ? encodeURIComponent(namespace) : ''}?view=deleted`;
}

/** File download label only. Address construction never derives a slug. */
export function toRepoSlug(name: string, fallbackId?: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remove unsafe download filename characters
  return (name || fallbackId || 'repository').replace(/[/\\\x00-\x1f]/g, '-');
}

export interface RepositoryPathProject {
  id?: string;
  project_id?: string;
  name: string;
  namespace?: string | null;
  canonical_path?: string | null;
}

/** Use only a backend-confirmed address. An ID route safely handles legacy data. */
export function getProjectRepoPath(project: RepositoryPathProject, _ownerSlug?: string): string {
  return project.canonical_path || getProjectIdRepoPath(project.id ?? project.project_id ?? '');
}

/** Project-id entry points resolve to the canonical owner/repository URL in the route layer. */
export function getProjectIdRepoPath(projectId: string): string {
  return `/project/${encodeURIComponent(projectId)}`;
}

export function getProjectIdHistoryPath(
  projectId: string,
  options: {
    branch?: string | null;
    commit?: string | null;
    view?: 'list' | 'canvas';
    returnTo?: string | null;
  } = {}
): string {
  const params = new URLSearchParams();
  if (options.branch && options.branch !== 'all') params.set('branch', options.branch);
  if (options.commit) params.set('commit', options.commit);
  if (options.view) params.set('view', options.view);
  if (options.returnTo) params.set('returnTo', options.returnTo);
  return `${getProjectIdRepoPath(projectId)}/history${params.size ? `?${params}` : ''}`;
}

export function getProjectIdCanvasPath(projectId: string): string {
  return `${getProjectIdRepoPath(projectId)}?view=canvas`;
}

export function getProjectIdWorkspacePath(
  projectId: string,
  options?: { branch?: string | null; sourceConversationId?: string | null }
): string {
  const params = new URLSearchParams({
    branch: options?.branch?.trim() || 'main',
    tab: 'workspaces',
  });
  const sourceConversationId = options?.sourceConversationId?.trim();
  if (sourceConversationId) params.set('sourceConversation', sourceConversationId);
  return `${getProjectIdRepoPath(projectId)}?${params.toString()}`;
}

export function getProjectIdCanvasCommitPath(projectId: string, commitHash: string): string {
  const params = new URLSearchParams({ view: 'canvas', commit: commitHash });
  return `${getProjectIdRepoPath(projectId)}?${params.toString()}`;
}

export function getProjectIdDiffPath(
  projectId: string,
  baseHash: string,
  targetHash: string
): string {
  const params = new URLSearchParams({ base: baseHash, target: targetHash });
  return `${getProjectIdRepoPath(projectId)}/diff?${params.toString()}`;
}

export function getProjectIdOutputsPath(projectId: string, leafId?: string): string {
  const params = new URLSearchParams({ tab: 'outputs' });
  if (leafId) params.set('leaf', leafId);
  return `${getProjectIdRepoPath(projectId)}?${params.toString()}`;
}

export function getProjectOutputsPath(project: RepositoryPathProject, leafId?: string): string {
  if (!project.canonical_path)
    return getProjectIdOutputsPath(project.id ?? project.project_id ?? '', leafId);
  const path = `${project.canonical_path}/outputs`;
  return leafId ? `${path}?leaf=${encodeURIComponent(leafId)}` : path;
}
