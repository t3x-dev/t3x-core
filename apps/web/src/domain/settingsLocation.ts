import { withReturnTo } from '@/utils/navigationReturn';

export function namespaceSettingsHref(namespace: string | null, returnTo = '') {
  const href = namespace ? `/settings?namespace=${encodeURIComponent(namespace)}` : '/settings';
  return returnTo ? withReturnTo(href, returnTo) : href;
}
