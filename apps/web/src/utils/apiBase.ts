const SOURCE_DEV_API_BASE = 'http://localhost:8000';

export function resolveApiBase(env: NodeJS.ProcessEnv, nodeEnv = env.NODE_ENV): string {
  if (env.NEXT_PUBLIC_API_URL) {
    return env.NEXT_PUBLIC_API_URL;
  }

  return nodeEnv === 'production' ? '' : SOURCE_DEV_API_BASE;
}

export function resolveWebSocketBase(
  apiBase: string,
  browserLocation?: Pick<Location, 'protocol' | 'host'>
): string {
  const base =
    apiBase ||
    (browserLocation
      ? `${browserLocation.protocol}//${browserLocation.host}`
      : SOURCE_DEV_API_BASE);
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  return url.origin;
}

export const API_BASE = resolveApiBase(process.env);
