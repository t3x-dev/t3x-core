import { getProjectIdRepoPath, repositoryBranchHref } from './repoPath';

export function numberedRepositoryObject(suffix: string) {
  const match = /^\/(commits|history|reviews)\/([1-9][0-9]{0,17})\/?$/.exec(suffix);
  if (!match) return null;
  const [, value, number] = match;
  const section = value as 'commits' | 'history' | 'reviews';
  return {
    section,
    number,
    kind: section === 'reviews' ? ('review' as const) : ('commit' as const),
  };
}

export function repositoryObjectHref(
  base: string,
  section: 'commits' | 'history' | 'reviews',
  number: string,
  search?: URLSearchParams
) {
  const params = new URLSearchParams(search);
  const branch = params.get('branch');
  if (section === 'history' && branch && branch !== 'all') {
    const listQuery = new URLSearchParams(params);
    listQuery.delete('commit');
    listQuery.delete('tab');
    params.set('returnTo', repositoryBranchHref(base, '/history', branch, listQuery));
  }
  params.delete('tab');
  params.delete('branch');
  if (section === 'reviews') {
    params.delete('reviewSnapshot');
    params.delete('workspace');
    params.delete('workspaceMode');
  } else {
    params.delete('commit');
  }
  return `${base}/${section}/${number}${params.size ? `?${params}` : ''}`;
}

export function historyCommitHref(
  historyHref: string,
  commit: { hash: string; address_number?: string }
) {
  const [path, query] = historyHref.split('?');
  const params = new URLSearchParams(query);
  if (commit.address_number && !path.startsWith('/project/')) {
    if (/\/branches\/[^/]+\/history$/.test(path)) params.set('returnTo', historyHref);
    return repositoryObjectHref(
      path.split('/').slice(0, 3).join('/'),
      'history',
      commit.address_number,
      params
    );
  }
  params.set('commit', commit.hash);
  return `${path}?${params}`;
}
export function commitStructureHref(
  repositoryPath: string | undefined,
  commit: { project_id: string; hash: string; branch: string; address_number?: string },
  preview = false
) {
  const query = new URLSearchParams({ view: 'structure' });
  if (preview) query.set('artifact', '1');
  if (repositoryPath && commit.address_number) {
    return repositoryObjectHref(repositoryPath, 'commits', commit.address_number, query);
  }
  query.set('commit', commit.hash);
  return repositoryBranchHref(
    repositoryPath ?? getProjectIdRepoPath(commit.project_id),
    '',
    commit.branch,
    query
  );
}
