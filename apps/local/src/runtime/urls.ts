export function buildIntroDemoUrl(webUrl: string): string {
  const url = new URL('/chat', webUrl.endsWith('/') ? webUrl : `${webUrl}/`);
  url.searchParams.set('introDemo', '1');
  return url.toString();
}
