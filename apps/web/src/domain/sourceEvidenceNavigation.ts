import { withReturnTo } from '@/utils/navigationReturn';

export const LEGACY_SOURCE_VIEW_PARAM = 'view';
export const LEGACY_SOURCE_VIEW_VALUE = 'source';

export interface RepositorySourceHrefInput {
  projectId: string;
  conversationId: string;
  branch?: string | null;
  commitId?: string | null;
  turnHash?: string | null;
  returnTo?: string | null;
}

export function repositoryConversationSourceHref(input: RepositorySourceHrefInput): string {
  const path = `/project/${encodeURIComponent(input.projectId)}/sources/conversations/${encodeURIComponent(
    input.conversationId
  )}`;
  const params = new URLSearchParams();
  if (input.branch) params.set('branch', input.branch);
  if (input.commitId) params.set('commit', input.commitId);
  if (input.turnHash) params.set('turn', input.turnHash);
  const href = params.size > 0 ? `${path}?${params.toString()}` : path;
  return input.returnTo ? withReturnTo(href, input.returnTo) : href;
}

export function isLegacyRepositorySourceLink(searchParams: URLSearchParams): boolean {
  return searchParams.get(LEGACY_SOURCE_VIEW_PARAM) === LEGACY_SOURCE_VIEW_VALUE;
}

export function legacyRepositorySourceTarget(
  projectId: string,
  conversationId: string,
  searchParams: URLSearchParams
): string {
  return repositoryConversationSourceHref({
    projectId,
    conversationId,
    branch: searchParams.get('branch'),
    commitId: searchParams.get('commit'),
    turnHash: searchParams.get('turn'),
    returnTo: searchParams.get('returnTo'),
  });
}
