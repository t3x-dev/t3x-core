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

export function repositoryAgentAccessHref(repositoryPath: string, branch = 'main'): string {
  const query = new URLSearchParams({ view: 'agent-access' });
  if (branch && branch !== 'main') query.set('targetBranch', branch);
  return `${repositoryPath}/settings?${query}`;
}

/** Call from a resolved repository route, where the first two segments are the address. */
export function getCanonicalRepositoryPath(pathname: string): string | undefined {
  return pathname.startsWith('/project/') ? undefined : pathname.split('/').slice(0, 3).join('/');
}

export function repositoryBranchRoute(suffix: string): { branch: string; suffix: string } | null {
  const match = /^\/branches\/([^/]+)(\/.*)?$/.exec(suffix);
  if (!match) return null;
  try {
    const branch = decodeURIComponent(match[1]);
    return branch && branch !== '.' && branch !== '..'
      ? { branch, suffix: (match[2] ?? '').replace(/\/$/, '') }
      : null;
  } catch {
    return null;
  }
}

export function repositoryBranch(
  pathname: string,
  query: { get: (key: string) => string | null }
): string | null {
  return (
    repositoryBranchRoute(`/${pathname.split('/').slice(3).join('/')}`)?.branch ??
    (query.get('branch')?.trim() || null)
  );
}

/** ID addresses remain compatibility entries until the repository name is resolved. */
export function repositoryBranchHref(
  base: string,
  suffix: string,
  branch: string | null,
  query?: URLSearchParams
): string {
  const params = new URLSearchParams(query);
  if (!base.startsWith('/project/')) params.delete('branch');
  let path = `${base}${suffix}`;
  if (branch && branch !== '.' && branch !== '..') {
    if (base.startsWith('/project/')) params.set('branch', branch);
    else if (branch !== 'main' || suffix)
      path = `${base}/branches/${encodeURIComponent(branch)}${suffix}`;
  } else if (branch) params.set('branch', branch);
  else params.delete('branch');
  return `${path}${params.size ? `?${params}` : ''}`;
}

export function workspaceLocation(base: string, branch: string | null, query?: URLSearchParams) {
  const params = new URLSearchParams(query);
  const idRoute = base.startsWith('/project/');
  const suffix = idRoute ? '' : '/workspaces';
  if (idRoute) params.set('tab', 'workspaces');
  else params.delete('tab');
  // An old Workspace link must resolve its explicit object before choosing a branch.
  const selectedBranch =
    branch ?? (params.has('workspace') || params.has('reviewSnapshot') ? null : 'main');
  return repositoryBranchHref(base, suffix, selectedBranch, params);
}

export function getProjectIdHistoryPath(
  projectId: string,
  options: {
    repositoryPath?: string;
    branch?: string | null;
    commit?: string | null;
    view?: 'list';
    returnTo?: string | null;
  } = {}
): string {
  const params = new URLSearchParams();
  if (options.commit) params.set('commit', options.commit);
  if (options.view) params.set('view', options.view);
  if (options.returnTo) params.set('returnTo', options.returnTo);
  return repositoryBranchHref(
    options.repositoryPath ?? getProjectIdRepoPath(projectId),
    '/history',
    options.branch === 'all' ? null : (options.branch ?? null),
    params
  );
}

export function getProjectIdCanvasPath(projectId: string): string {
  return `${getProjectIdRepoPath(projectId)}?view=canvas`;
}

export function getProjectIdWorkspacePath(
  projectId: string,
  options?: {
    branch?: string | null;
    sourceConversationId?: string | null;
    repositoryPath?: string;
  }
): string {
  const branch = options?.branch?.trim() || 'main';
  const params = new URLSearchParams({ branch, tab: 'workspaces' });
  const sourceConversationId = options?.sourceConversationId?.trim();
  if (sourceConversationId) params.set('sourceConversation', sourceConversationId);
  return workspaceLocation(
    options?.repositoryPath ?? getProjectIdRepoPath(projectId),
    branch,
    params
  );
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
