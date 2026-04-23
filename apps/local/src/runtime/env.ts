import path from 'node:path';
import type { LocalPaths } from './paths.js';

export const DEFAULT_API_PORT = 8000;
export const DEFAULT_WEB_PORT = 3000;

export interface StartOptionsInput {
  dataDir?: string;
  apiPort?: number;
  webPort?: number;
}

export interface ResolvedStartOptions {
  dataDir: string;
  apiPort: number;
  webPort: number;
}

export function resolveStartOptions(
  input: StartOptionsInput,
  paths: LocalPaths,
  baseEnv: NodeJS.ProcessEnv = process.env
): ResolvedStartOptions {
  const apiPort = input.apiPort ?? DEFAULT_API_PORT;
  const webPort = input.webPort ?? DEFAULT_WEB_PORT;

  validatePort(apiPort, 'API');
  validatePort(webPort, 'Web');

  if (apiPort === webPort) {
    throw new Error('[t3x-local] API port and Web port must be different');
  }

  return {
    dataDir: path.resolve(input.dataDir ?? baseEnv.T3X_DATA_DIR ?? paths.defaultDataDir),
    apiPort,
    webPort,
  };
}

export function buildApiEnv(
  baseEnv: NodeJS.ProcessEnv,
  options: ResolvedStartOptions
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    NODE_ENV: 'development',
    PORT: String(options.apiPort),
    AUTH_DISABLED: 'true',
    NEXT_PUBLIC_AUTH_DISABLED: 'true',
    T3X_DATA_DIR: options.dataDir,
  };
}

export function buildWebEnv(
  baseEnv: NodeJS.ProcessEnv,
  options: ResolvedStartOptions
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    NODE_ENV: 'production',
    PORT: String(options.webPort),
    HOSTNAME: '0.0.0.0',
    AUTH_DISABLED: 'true',
    NEXT_PUBLIC_AUTH_DISABLED: 'true',
    NEXT_PUBLIC_API_URL: `http://localhost:${options.apiPort}`,
  };
}

function validatePort(port: number, label: string): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[t3x-local] ${label} port must be an integer between 1 and 65535`);
  }
}
