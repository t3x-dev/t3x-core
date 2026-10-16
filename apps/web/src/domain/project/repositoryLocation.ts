/** Only routes with an explicit owner/name adapter may migrate from ID links. */
export function isSupportedRepositorySuffix(suffix: string): boolean {
  return /^(?:\/?|\/(?:state|workspaces|pull-requests|outputs|community|schemas|settings|diff|history|knowledge-graph)\/?|\/(?:merge|leaf)\/[^/]+\/?|\/changes\/[^/]+\/[^/]+\/?|\/sources\/conversations\/[^/]+\/?)$/.test(
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
      ['state', 'workspaces', 'pull-requests', 'outputs', 'community', 'schemas', 'settings'].includes(
        tab
      )
    ) {
      tail = tab === 'state' ? '' : `/${tab}`;
      params.delete('tab');
    }
  }
  return `${base}${tail}${params.size ? `?${params}` : ''}${hash}`;
}
