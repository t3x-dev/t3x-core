import { useEffect } from 'react';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { prefetchDirectoryPage } from '@/infrastructure/projects';
import { getSessionUserId } from '@/infrastructure/session';

export { REPOSITORY_DIRECTORY_PAGE_SIZE } from '@/infrastructure/projects';

export function prefetchRepositoryDirectoryPage() {
  const userId = getSessionUserId();
  if (userId && !document.hidden) prefetchDirectoryPage(userId);
}

export function useRepositoryDirectoryIdlePrefetch(enabled: boolean) {
  const userId = useSessionUserId();
  useEffect(() => {
    if (!enabled || !userId || document.visibilityState === 'hidden') return;
    if (typeof window.requestIdleCallback === 'function') {
      const idle = window.requestIdleCallback(prefetchRepositoryDirectoryPage);
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(prefetchRepositoryDirectoryPage, 1500);
    return () => window.clearTimeout(timer);
  }, [enabled, userId]);
}
