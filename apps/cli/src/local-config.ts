import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type FileConfig = {
  api_url?: string;
  api_key?: string;
};

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
