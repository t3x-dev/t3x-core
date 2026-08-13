export const DEFAULT_RUNNER_HOST = '127.0.0.1';
export const RUNNER_UNAUTHENTICATED_NETWORK_OVERRIDE_ENV =
  'T3X_ALLOW_UNAUTHENTICATED_RUNNER_NETWORK';

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

function hasServiceToken(env: NodeJS.ProcessEnv): boolean {
  const token = env.RUNNER_SERVICE_TOKEN ?? env.RUNNER_SECRET;
  return Boolean(token && token.length > 0);
}

/**
 * Standalone Runner is an evaluation surface with stateful control routes.
 * Keep source use loopback-only unless a deployment explicitly chooses a
 * different bind address.
 */
export function resolveRunnerHost(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.RUNNER_HOST?.trim();
  const host = configured || DEFAULT_RUNNER_HOST;
  if (
    !isLoopbackHost(host) &&
    !hasServiceToken(env) &&
    env[RUNNER_UNAUTHENTICATED_NETWORK_OVERRIDE_ENV]?.toLowerCase() !== 'true'
  ) {
    throw new Error(
      `Runner cannot bind a non-loopback host without RUNNER_SERVICE_TOKEN (or RUNNER_SECRET) or explicitly setting ${RUNNER_UNAUTHENTICATED_NETWORK_OVERRIDE_ENV}=true`
    );
  }
  return host;
}

export function resolveRunnerPort(port: number | string): number {
  const numericPort = typeof port === 'string' ? Number(port) : port;
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    throw new Error('Runner port must be an integer between 1 and 65535');
  }
  return numericPort;
}
