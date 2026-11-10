function releaseSegment(value: string) {
  return /^[a-z0-9._-]+$/i.test(value) && value !== '.' && value !== '..';
}

export function exploreReleasePath(canonicalName: string, version: string): string | undefined {
  const name = canonicalName.split('/');
  const segments = [...name, version];
  if (name.length < 2 || version === 'latest' || !segments.every(releaseSegment)) return undefined;
  return `/explore/schemas/${segments.join('/')}`;
}

/** Only this internal destination can be carried through project creation and Studio. */
export function safeExploreReturn(value: string | null | undefined): string | undefined {
  if (!value || /[\\\r\n]/.test(value)) return undefined;
  const pathname = value.split(/[?#]/, 1)[0];
  if (pathname === '/explore') return value;
  if (!pathname.startsWith('/explore/schemas/')) return undefined;
  const segments = pathname.split('/').slice(3);
  const version = segments.pop();
  return version && exploreReleasePath(segments.join('/'), version) === pathname
    ? value
    : undefined;
}
export function legacyExploreLocation(
  projectId: string,
  tab: 'discover' | 'browse',
  query: string
): string {
  const params = new URLSearchParams(query);
  if (params.get('schemaView') === 'active') {
    params.set('tab', 'schemas');
    params.set('schemaView', 'studio');
    return `/project/${encodeURIComponent(projectId)}?${params}`;
  }
  params.delete('tab');
  params.set('view', tab);
  params.set('type', 'schemas');
  params.set('studioTarget', projectId);
  if (params.has('catalogName') && !params.has('sourceProjectId'))
    params.set('catalogProjectId', projectId);
  if (params.get('schemaView') !== 'release') params.delete('schemaView');
  return `/explore?${params}`;
}
