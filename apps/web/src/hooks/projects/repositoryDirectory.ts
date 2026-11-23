import { loadRepositoryDirectoryPage } from '@/infrastructure/projects';
import { getSessionUserId } from '@/infrastructure/session';

export { REPOSITORY_DIRECTORY_PAGE_SIZE } from '@/infrastructure/projects';

export function prefetchRepositoryDirectoryPage() {
  const userId = getSessionUserId();
  if (userId) void loadRepositoryDirectoryPage(userId).catch(() => {});
}
