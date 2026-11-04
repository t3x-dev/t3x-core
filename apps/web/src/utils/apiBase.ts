const SOURCE_DEV_WEB_BASE = 'http://localhost:3000';

export function resolveWebSocketBase(
  _apiBase: string,
  browserLocation?: Pick<Location, 'protocol' | 'host'>
): string {
  const base = browserLocation
    ? `${browserLocation.protocol}//${browserLocation.host}`
    : SOURCE_DEV_WEB_BASE;
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  return url.origin;
}
