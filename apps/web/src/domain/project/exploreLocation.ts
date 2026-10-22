/** Only this internal destination can be carried through project creation and Studio. */
export function safeExploreReturn(value: string | null | undefined): string | undefined {
  if (!value || !/^\/explore(?:\?|$)/.test(value) || /[\\\r\n]/.test(value)) return undefined;
  return value;
}
export function legacyExploreLocation(
  projectId: string,
  tab: 'discover' | 'browse',
  query: string
): string {
  const params = new URLSearchParams(query);
  if (params.get('schemaView') === 'active') {
    params.set('tab', 'schemas');
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
