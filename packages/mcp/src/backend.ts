import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createClient, T3xApiError, type T3xClient } from '@t3x-dev/api-client';
import { mcpFetch, mcpHttpFetch } from './diagnostics.js';

type FileConfig = {
  api_url?: string;
  api_key?: string;
};

export type McpBackend = 'storage' | 'api';

const requestApiClients = new AsyncLocalStorage<T3xClient>();

export async function runWithMcpApiCredential(
  apiUrl: string,
  token: string,
  run: () => Promise<void>
): Promise<'handled' | 'unauthorized' | 'rate-limited'> {
  const client = createClient({
    baseUrl: apiUrl,
    headers: { Authorization: `Bearer ${token}` },
    fetch: mcpHttpFetch,
  });
  try {
    await client.getCredentialContext();
  } catch (error) {
    if (error instanceof T3xApiError) {
      if (error.status === 401 || error.status === 403) return 'unauthorized';
      if (error.status === 429) return 'rate-limited';
    }
    throw error;
  }
  await requestApiClients.run(client, run);
  return 'handled';
}

function getConfigPath(): string {
  return process.env.T3X_CONFIG_PATH || path.join(homedir(), '.t3x', 'config.json');
}

function readFileConfig(): FileConfig {
  try {
    const raw = JSON.parse(readFileSync(getConfigPath(), 'utf8')) as FileConfig;
    return {
      api_url: typeof raw.api_url === 'string' && raw.api_url.trim() ? raw.api_url : undefined,
      api_key: typeof raw.api_key === 'string' && raw.api_key.trim() ? raw.api_key : undefined,
    };
  } catch {
    return {};
  }
}

export function getBackend(): McpBackend {
  const explicit = process.env.T3X_MCP_BACKEND?.trim().toLowerCase();
  if (explicit === 'api' || explicit === 'storage') {
    return explicit;
  }

  if (process.env.T3X_API_URL || process.env.T3X_API_KEY) {
    return 'api';
  }

  return 'storage';
}

export function isApiBackend(): boolean {
  return getBackend() === 'api';
}

export function getApiClient(): T3xClient {
  const requestClient = requestApiClients.getStore();
  if (requestClient) return requestClient;
  if (process.env.T3X_TRANSPORT === 'http') {
    throw new Error('The MCP HTTP request has no authenticated API client.');
  }

  const fileConfig = readFileConfig();
  const apiUrl = process.env.T3X_API_URL || fileConfig.api_url || 'http://localhost:8000/api';
  const apiKey = process.env.T3X_API_KEY || fileConfig.api_key;
  const headers: Record<string, string> = {};

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return createClient({ baseUrl: apiUrl, headers, fetch: mcpFetch });
}

export function unwrapListPayload<T>(result: T, key: string): T {
  if (Array.isArray(result)) {
    return result;
  }

  if (result && typeof result === 'object' && key in (result as Record<string, unknown>)) {
    return (result as Record<string, unknown>)[key] as T;
  }

  return result;
}
