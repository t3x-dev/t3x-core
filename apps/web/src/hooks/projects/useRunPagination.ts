import { useEffect, useState } from 'react';

const PAGE_KEY = 't3xRunPage';
const RETURN_KEY = 't3xRunReturn';
type Page = { scope: string; cursor: string | null };
let incomingDetail: string | undefined;

export function useRunPagination(pathname: string, query: string, detail: boolean) {
  const params = new URLSearchParams(query);
  const legacy = detail ? null : params.get('cursor');
  params.delete('cursor');
  const cleanQuery = params.toString();
  const scope = `${pathname}${cleanQuery ? `?${cleanQuery}` : ''}`;
  const [page, setPage] = useState<Page>();
  const [returnPath, setReturnPath] = useState<string>();

  useEffect(() => {
    if (detail) {
      const pending = incomingDetail;
      incomingDetail = undefined;
      if (pending === pathname) {
        window.history.replaceState({ [RETURN_KEY]: pathname }, '');
      }
      setReturnPath(window.history.state?.[RETURN_KEY]);
      return;
    }
    incomingDetail = undefined;
    function readPage() {
      const stored: Page | undefined = window.history.state?.[PAGE_KEY];
      setPage(stored?.scope === scope ? stored : undefined);
    }
    if (legacy !== null) {
      const position = { scope, cursor: legacy || null };
      window.history.replaceState({ [PAGE_KEY]: position }, '', scope + window.location.hash);
    }
    readPage();
    window.addEventListener('popstate', readPage);
    return () => window.removeEventListener('popstate', readPage);
  }, [detail, legacy, pathname, scope]);

  const cursor = detail ? null : legacy || (page?.scope === scope ? page.cursor : null);
  if (cursor) params.set('cursor', cursor);

  return {
    apiQuery: params.toString(),
    cleanQuery,
    cursor,
    returnToPrevious: detail && returnPath === pathname,
    rememberDetail(href: string) {
      if (cursor) incomingDetail = href.split('?')[0];
    },
    replaceDetail(href: string) {
      const state =
        window.history.state?.[RETURN_KEY] === pathname ? { [RETURN_KEY]: pathname } : null;
      window.history.replaceState(state, '', href);
    },
    openPage(next: string | null) {
      const position = { scope, cursor: next };
      window.history.pushState({ [PAGE_KEY]: position }, '', scope + window.location.hash);
      setPage(position);
    },
  };
}
