import { numberedRepositoryObject, repositoryObjectHref } from './objectLocation';
import { repositoryBranchHref, repositoryBranchRoute, workspaceLocation } from './repoPath';

const BRANCH_SUFFIX =
  /^(?:\/?|\/(?:state|workspaces|schemas|discover|browse|history|diff)\/?|\/sources\/conversations\/[^/]+\/?)$/;

export function getSchemaProjectTab(schemaView: string | null): 'schemas' | 'discover' | 'browse' {
  if (schemaView === 'discover') return 'discover';
  if (schemaView === 'browse' || schemaView === 'release') return 'browse';
  return 'schemas';
}

/** Only routes with an explicit owner/name adapter may migrate from ID links. */
export function isSupportedRepositorySuffix(suffix: string): boolean {
  const scoped = repositoryBranchRoute(suffix);
  if (scoped) return BRANCH_SUFFIX.test(scoped.suffix);
  return (
    numberedRepositoryObject(suffix) !== null ||
    /^(?:\/?|\/(?:state|workspaces|pull-requests|checks|community|schemas|discover|browse|settings|diff|history|knowledge-graph)\/?|\/checks\/[^/]+\/?|\/merge\/[^/]+\/?|\/changes\/[^/]+\/[^/]+\/?|\/sources\/conversations\/[^/]+\/?)$/.test(
      suffix
    )
  );
}

/** Retired output pages must not fall back to State or canonicalize to an active view. */
export function isRetiredRepositoryLocation(
  suffix: string,
  searchParams: { get: (key: string) => string | null }
): boolean {
  return (
    /^\/(?:outputs|leaf)(?:\/|$)/.test(suffix) ||
    (/^(?:\/?|\/state\/?)$/.test(suffix) && searchParams.get('tab') === 'outputs')
  );
}

export function repositoryLocation(
  base: string,
  suffix: string,
  query: string,
  hash = '',
  sourceBase = base
): string {
  const params = new URLSearchParams(query);
  const scoped = repositoryBranchRoute(suffix);
  let tail = (scoped?.suffix ?? suffix).replace(/\/$/, '');
  if (tail === '/state') tail = '';
  if (!scoped && !tail && params.has('tab')) {
    const tab = params.get('tab');
    if (
      tab &&
      [
        'state',
        'workspaces',
        'pull-requests',
        'checks',
        'history',
        'community',
        'schemas',
        'discover',
        'browse',
        'settings',
      ].includes(tab)
    ) {
      tail = tab === 'state' ? '' : `/${tab}`;
    }
  }
  params.delete('tab');
  const numbered = numberedRepositoryObject(tail);
  if (numbered && !base.startsWith('/project/'))
    return `${repositoryObjectHref(base, numbered.section, numbered.number, params)}${hash}`;
  const branch = scoped?.branch ?? (params.get('branch')?.trim() || null);
  if (tail === '/workspaces') {
    return `${workspaceLocation(base, branch, params)}${hash}`;
  }
  if (/^\/schemas\/?$/.test(tail)) {
    tail = '/schemas';
    const tab = getSchemaProjectTab(params.get('schemaView'));
    if (tab !== 'schemas') {
      tail = `/${tab}`;
      if (params.get('schemaView') === 'discover' || params.get('schemaView') === 'browse') {
        params.delete('schemaView');
      }
    }
  }
  const returnTo = params.get('returnTo');
  if (
    /^\/checks\/[^/]+\/?$/.test(tail) &&
    (returnTo === `${base}/checks` || returnTo === `${sourceBase}/checks`) &&
    [...params.keys()].every((key) => key === 'returnTo' || key === 'check')
  ) {
    params.delete('returnTo');
  }
  if (BRANCH_SUFFIX.test(tail)) {
    const selectedBranch =
      tail === '/history' && branch === 'all'
        ? null
        : (branch ?? (!tail || (tail === '/schemas' && !params.has('workspace')) ? 'main' : null));
    return `${repositoryBranchHref(base, tail, selectedBranch, params)}${hash}`;
  }
  // Repository-wide pages and exact historical records do not select a branch.
  params.delete('branch');
  return `${base}${tail}${params.size ? `?${params}` : ''}${hash}`;
}
