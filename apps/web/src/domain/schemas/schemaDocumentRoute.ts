import { repositoryBranchRoute } from '@/domain/project/repoPath';

export const SCHEMA_DOCUMENT_HEADER = 'x-t3x-schema-document';

export function schemaDocumentRoute(pathname: string, search: string) {
  const [, owner, repository, ...rest] = pathname.split('/');
  if (!owner || !repository) return null;
  const branch = repositoryBranchRoute(`/${rest.join('/')}`);
  const query = new URLSearchParams(search);
  if (branch?.suffix !== '/schemas' || query.has('candidate') || query.has('schemaView'))
    return null;
  try {
    return {
      owner: decodeURIComponent(owner),
      repository: decodeURIComponent(repository),
      branch: branch.branch,
      workspace: query.get('workspace') || undefined,
    };
  } catch {
    return null;
  }
}

/** The proxy overwrites the incoming header and seeds only full document loads. */
export function schemaDocumentHeaders(request: { headers: Headers; nextUrl: URL }) {
  const headers = new Headers(request.headers);
  headers.delete(SCHEMA_DOCUMENT_HEADER);
  const { pathname, search } = request.nextUrl;
  if (headers.get('sec-fetch-dest') === 'document' && schemaDocumentRoute(pathname, search)) {
    const query = request.nextUrl.searchParams.toString();
    headers.set(SCHEMA_DOCUMENT_HEADER, query ? `${pathname}?${query}` : pathname);
  }
  return headers;
}
