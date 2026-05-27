export const RETURN_TO_PARAM = 'returnTo';

export function buildReturnTo(pathname: string, searchParams?: URLSearchParams | string | null) {
  const rawSearch =
    typeof searchParams === 'string' ? searchParams : (searchParams?.toString() ?? '');
  const search = rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch;
  return search ? `${pathname}?${search}` : pathname;
}

export function withReturnTo(href: string, returnTo: string) {
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}`;
}

export function safeInternalReturnTo(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  try {
    const url = new URL(value, 'https://t3x.local');
    if (url.origin !== 'https://t3x.local') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
