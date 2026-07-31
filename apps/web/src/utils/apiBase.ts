const SOURCE_DEV_API_BASE = 'http://localhost:8000';

type ApiBaseEnv = Pick<NodeJS.ProcessEnv, 'NEXT_PUBLIC_API_URL' | 'NODE_ENV'>;

export function resolveApiBase(env: ApiBaseEnv, nodeEnv = env.NODE_ENV): string {
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

// Next.js only inlines public variables when it can see a direct property access.
// Passing the whole process.env object leaves production client bundles without
// NEXT_PUBLIC_API_URL and silently falls back to the source-development URL.
export const API_BASE = resolveApiBase({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NODE_ENV: process.env.NODE_ENV,
});
