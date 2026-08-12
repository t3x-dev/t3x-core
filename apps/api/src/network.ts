export const DEFAULT_API_HOST = '127.0.0.1';

function isAuthenticationDisabled(env: NodeJS.ProcessEnv): boolean {
  if (env.AUTH_DISABLED?.toLowerCase() !== 'true') return false;
  if (env.NODE_ENV !== 'production') return true;
  return env.T3X_ALLOW_AUTH_DISABLED_IN_PRODUCTION?.toLowerCase() === 'true';
}

export function resolveApiAuthenticationMode(
  env: NodeJS.ProcessEnv = process.env
): 'disabled' | 'required' {
  return isAuthenticationDisabled(env) ? 'disabled' : 'required';
}

function isLoopbackHost(host: string): boolean {
  const normalized = host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (normalized === 'localhost' || normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }
  const octets = normalized.split('.');
  return octets.length === 4 && octets[0] === '127';
}

export function resolveApiHost(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.HOST?.trim();
  const host = configured || DEFAULT_API_HOST;
  if (!isLoopbackHost(host) && isAuthenticationDisabled(env)) {
    throw new Error('API cannot bind a non-loopback host while authentication is disabled');
  }
  return host;
}
