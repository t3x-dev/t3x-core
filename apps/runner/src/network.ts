export const DEFAULT_RUNNER_HOST = '127.0.0.1';

/**
 * Standalone Runner is an evaluation surface with stateful control routes.
 * Keep source use loopback-only unless a deployment explicitly chooses a
 * different bind address.
 */
export function resolveRunnerHost(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.RUNNER_HOST?.trim();
  return configured || DEFAULT_RUNNER_HOST;
}

export function resolveRunnerPort(port: number | string): number {
  const numericPort = typeof port === 'string' ? Number(port) : port;
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    throw new Error('Runner port must be an integer between 1 and 65535');
  }
  return numericPort;
}
