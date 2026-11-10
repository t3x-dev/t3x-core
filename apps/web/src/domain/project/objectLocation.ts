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
  params.delete('tab');
  if (section === 'reviews') {
    params.delete('reviewSnapshot');
    params.delete('workspace');
    params.delete('workspaceMode');
    params.delete('branch');
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
    return `${path}/${commit.address_number}${params.size ? `?${params}` : ''}`;
  }
  params.set('commit', commit.hash);
  return `${path}?${params}`;
}
