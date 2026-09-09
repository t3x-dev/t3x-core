import type { WorkspaceSchemaBinding } from '@/types/workspaces';

export function getWorkspaceYOpsRootKey(bindings: WorkspaceSchemaBinding[]): string {
  const primary = bindings[0];
  if (!primary) return '';
  if (primary?.rootKey && /^[a-z][a-z0-9_]*$/.test(primary.rootKey)) return primary.rootKey;
  const canonicalName = primary?.canonicalName?.trim().toLowerCase();
  if (canonicalName?.startsWith('studio:')) return 'candidate';
  if (canonicalName === 't3x/esphome-device') return 'device';
  if (canonicalName) return toSnakeKey(canonicalName.split('/').at(-1) ?? 'candidate');

  const primaryName = primary?.schemaName.replace(/\s+Schema$/i, '') ?? 'candidate';
  if (/esphome\s+device/i.test(primaryName)) return 'device';
  return toSnakeKey(primaryName);
}

export function normalizeYOpsPath(path: string, rootKey: string): string {
  const withoutArrayPush = path.replace(/\/-$/, '');
  // Unbound projects use exact document paths, without a synthetic schema root.
  if (!rootKey) return withoutArrayPush;
  const segments = withoutArrayPush
    .split('/')
    .filter(Boolean)
    .map((segment) => toSnakeKey(segment));

  if (segments[0] === rootKey) return segments.join('/');
  return [rootKey, ...segments].join('/');
}

export function toSnakeKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}
