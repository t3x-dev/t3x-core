const SOURCE_DEV_API_BASE = 'http://localhost:8000';

export function resolveApiBase(env: NodeJS.ProcessEnv, nodeEnv = env.NODE_ENV): string {
  if (env.NEXT_PUBLIC_API_URL) {
    return env.NEXT_PUBLIC_API_URL;
  }

  return nodeEnv === 'production' ? '' : SOURCE_DEV_API_BASE;
}

export const API_BASE = resolveApiBase(process.env);
