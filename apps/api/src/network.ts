export const DEFAULT_API_HOST = '127.0.0.1';

export function resolveApiHost(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.HOST?.trim();
  return configured || DEFAULT_API_HOST;
}
