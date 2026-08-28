import type { Namespace } from '@t3x-dev/storage';

export function canUseNamespace(namespace: Namespace, userId: string | undefined): boolean {
  if (namespace.kind === 'organization') {
    return namespace.slug === 't3x-dev';
  }
  return userId ? namespace.ownerUserId === userId : namespace.ownerUserId === null;
}
