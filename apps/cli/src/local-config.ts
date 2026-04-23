import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type FileConfig = {
  api_url?: string;
  api_key?: string;
};

export interface LocalAccessCheckResult {
  ok: boolean;
  code:
    | 'ACCESS_OK'
    | 'AUTH_NOT_REQUIRED'
    | 'MISSING_API_KEY'
    | 'INVALID_API_KEY'
    | 'API_UNREACHABLE'
    | 'API_ERROR';
  auth_mode: 'open' | 'protected' | 'unreachable';
  message: string;
  api_url: string;
  api_key_present: boolean;
  api_key_source: 'env' | 'file' | 'none';
  status_code: number | null;
}

export interface LocalConfigState {
  api_url: string;
  api_url_source: 'env' | 'file' | 'default';
  api_key_present: boolean;
  api_key_source: 'env' | 'file' | 'none';
  api_key_preview: string | null;
  config_path: string;
}

export function getLocalConfigPath(): string {
  return process.env.T3X_CONFIG_PATH || path.join(homedir(), '.t3x', 'config.json');
}

function readFileConfig(): FileConfig {
  try {
    const raw = JSON.parse(readFileSync(getLocalConfigPath(), 'utf8')) as FileConfig;
    return {
      api_url: typeof raw.api_url === 'string' && raw.api_url.trim() ? raw.api_url : undefined,
      api_key: typeof raw.api_key === 'string' && raw.api_key.trim() ? raw.api_key : undefined,
    };
  } catch {
    return {};
  }
}

function writeFileConfig(next: FileConfig): void {
  const configPath = getLocalConfigPath();
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function maskKeyPreview(key: string | undefined): string | null {
  if (!key) return null;
  return `${key.slice(0, 8)}...`;
}

export function getFileApiKey(): string | undefined {
  return readFileConfig().api_key;
}

function getEffectiveApiKey(): string | undefined {
  return process.env.T3X_API_KEY || getFileApiKey();
}

export function resolveLocalConfigState(): LocalConfigState {
  const fileConfig = readFileConfig();
  const envApiUrl = process.env.T3X_API_URL;
  const envApiKey = process.env.T3X_API_KEY;
  const apiUrl = envApiUrl || fileConfig.api_url || 'http://localhost:8000/api';
  const apiUrlSource: LocalConfigState['api_url_source'] = envApiUrl
    ? 'env'
    : fileConfig.api_url
      ? 'file'
      : 'default';
  const effectiveKey = envApiKey || fileConfig.api_key;
  const apiKeySource: LocalConfigState['api_key_source'] = envApiKey
    ? 'env'
    : fileConfig.api_key
      ? 'file'
      : 'none';

  return {
    api_url: apiUrl,
    api_url_source: apiUrlSource,
    api_key_present: !!effectiveKey,
    api_key_source: apiKeySource,
    api_key_preview: maskKeyPreview(effectiveKey),
    config_path: getLocalConfigPath(),
  };
}

export function updateLocalConfig(input: FileConfig): LocalConfigState {
  const current = readFileConfig();
  const next: FileConfig = { ...current, ...input };
  writeFileConfig(next);
  return resolveLocalConfigState();
}

export function clearStoredApiKey(): LocalConfigState {
  const current = readFileConfig();
  const next = { ...current };
  delete next.api_key;
  writeFileConfig(next);
  return resolveLocalConfigState();
}

function buildStatusUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/v1/status`;
}

async function requestStatus(url: string, apiKey?: string): Promise<Response> {
  const headers = new Headers();
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
  return fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(5000),
  });
}

export async function checkLocalAccess(): Promise<LocalAccessCheckResult> {
  const state = resolveLocalConfigState();
  const apiKey = getEffectiveApiKey();
  const statusUrl = buildStatusUrl(state.api_url);

  let probeResponse: Response;
  try {
    probeResponse = await requestStatus(statusUrl);
  } catch (error) {
    return {
      ok: false,
      code: 'API_UNREACHABLE',
      auth_mode: 'unreachable',
      message: error instanceof Error ? error.message : 'Could not reach the target API.',
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: null,
    };
  }

  if (probeResponse.ok) {
    const message = state.api_key_present
      ? 'The target API is reachable and does not currently require a key. The configured key was not needed for this result.'
      : 'The target API is reachable and does not currently require a key.';
    return {
      ok: true,
      code: 'AUTH_NOT_REQUIRED',
      auth_mode: 'open',
      message,
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: probeResponse.status,
    };
  }

  if (probeResponse.status !== 401 && probeResponse.status !== 403) {
    return {
      ok: false,
      code: 'API_ERROR',
      auth_mode: 'unreachable',
      message: `The target API responded with HTTP ${probeResponse.status}.`,
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: probeResponse.status,
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      code: 'MISSING_API_KEY',
      auth_mode: 'protected',
      message: 'The target API requires authentication, but no API key is configured.',
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: probeResponse.status,
    };
  }

  try {
    const authResponse = await requestStatus(statusUrl, apiKey);
    if (authResponse.ok) {
      return {
        ok: true,
        code: 'ACCESS_OK',
        auth_mode: 'protected',
        message: 'Configured key is accepted by the target API.',
        api_url: state.api_url,
        api_key_present: state.api_key_present,
        api_key_source: state.api_key_source,
        status_code: authResponse.status,
      };
    }

    if (authResponse.status === 401 || authResponse.status === 403) {
      return {
        ok: false,
        code: 'INVALID_API_KEY',
        auth_mode: 'protected',
        message: 'Configured key was rejected by the target API.',
        api_url: state.api_url,
        api_key_present: state.api_key_present,
        api_key_source: state.api_key_source,
        status_code: authResponse.status,
      };
    }

    return {
      ok: false,
      code: 'API_ERROR',
      auth_mode: 'protected',
      message: `The target API responded with HTTP ${authResponse.status} after auth.`,
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: authResponse.status,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'API_UNREACHABLE',
      auth_mode: 'unreachable',
      message: error instanceof Error ? error.message : 'Could not reach the target API.',
      api_url: state.api_url,
      api_key_present: state.api_key_present,
      api_key_source: state.api_key_source,
      status_code: null,
    };
  }
}
