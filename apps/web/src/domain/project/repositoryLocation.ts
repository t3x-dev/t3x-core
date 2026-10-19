export function getSchemaProjectTab(schemaView: string | null): 'schemas' | 'discover' | 'browse' {
  if (schemaView === 'discover') return 'discover';
  if (schemaView === 'browse' || schemaView === 'active' || schemaView === 'release')
    return 'browse';
  return 'schemas';
}

/** Only routes with an explicit owner/name adapter may migrate from ID links. */
export function isSupportedRepositorySuffix(suffix: string): boolean {
  return /^(?:\/?|\/(?:state|workspaces|pull-requests|outputs|community|schemas|discover|browse|settings|diff|history|knowledge-graph)\/?|\/(?:merge|leaf)\/[^/]+\/?|\/changes\/[^/]+\/[^/]+\/?|\/sources\/conversations\/[^/]+\/?)$/.test(
    suffix
  );
}

export function repositoryLocation(base: string, suffix: string, query: string, hash = ''): string {
  const params = new URLSearchParams(query);
  let tail = suffix === '/state' ? '' : suffix;
  if ((!tail || tail === '/') && params.has('tab')) {
    const tab = params.get('tab');
    if (
      tab &&
      [
        'state',
        'workspaces',
        'pull-requests',
        'outputs',
        'community',
        'schemas',
        'discover',
        'browse',
        'settings',
      ].includes(tab)
    ) {
      tail = tab === 'state' ? '' : `/${tab}`;
      params.delete('tab');
    }
  }
  if (/^\/schemas\/?$/.test(tail)) {
    const tab = getSchemaProjectTab(params.get('schemaView'));
    if (tab !== 'schemas') {
      tail = `/${tab}`;
      if (params.get('schemaView') === 'discover' || params.get('schemaView') === 'browse') {
        params.delete('schemaView');
      }
    }
  }
  return `${base}${tail}${params.size ? `?${params}` : ''}${hash}`;
}
