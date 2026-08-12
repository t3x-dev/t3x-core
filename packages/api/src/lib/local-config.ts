import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type FileConfig = {
  api_url?: string;
  api_key?: string;
  api_key_origin?: string;
};

const DEFAULT_API_URL = 'http://localhost:8000/api';

export type LocalConfigSource = 'env' | 'file' | 'default' | 'none';

export interface LocalConfigState {
  api_url: string;
  api_url_source: Exclude<LocalConfigSource, 'none'>;
  api_key_present: boolean;
  api_key_source: Extract<LocalConfigSource, 'env' | 'file' | 'none'>;
  api_key_preview: string | null;
  config_path: string;
}

export function getLocalConfigPath(): string {
  return process.env.T3X_CONFIG_PATH || path.join(homedir(), '.t3x', 'config.json');
}

function readFileConfig(): FileConfig {
  const configPath = getLocalConfigPath();
  if (!fs.existsSync(configPath)) return {};

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FileConfig;
    return {
      api_url: typeof raw.api_url === 'string' && raw.api_url.trim() ? raw.api_url : undefined,
      api_key: typeof raw.api_key === 'string' && raw.api_key.trim() ? raw.api_key : undefined,
      api_key_origin:
        typeof raw.api_key_origin === 'string' && raw.api_key_origin.trim()
          ? raw.api_key_origin
          : undefined,
    };
  } catch {
    return {};
  }
}

function writeFileConfig(next: FileConfig): void {
  const configPath = getLocalConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(`${configPath}`, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function maskKeyPreview(key: string | undefined): string | null {
  if (!key) return null;
  return `${key.slice(0, 8)}...`;
}

export function resolveLocalConfigState(): LocalConfigState {
  const fileConfig = readFileConfig();
  const envApiUrl = process.env.T3X_API_URL;
  const envApiKey = process.env.T3X_API_KEY;
  const apiUrl = envApiUrl || fileConfig.api_url || DEFAULT_API_URL;
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
  const next: FileConfig = {
    ...current,
    ...input,
  };
  if (input.api_key !== undefined) {
    const credentialApiUrl =
      process.env.T3X_API_URL || input.api_url || current.api_url || DEFAULT_API_URL;
    next.api_key_origin = getHttpOrigin(credentialApiUrl);
  }
  writeFileConfig(next);
  return resolveLocalConfigState();
}

export function clearStoredApiKey(): LocalConfigState {
  const current = readFileConfig();
  const next: FileConfig = { ...current };
  delete next.api_key;
  delete next.api_key_origin;
  writeFileConfig(next);
  return resolveLocalConfigState();
}

export interface EffectiveApiCredential {
  apiKey: string | undefined;
  trustedOrigin: string | undefined;
}

export function getHttpOrigin(apiUrl: string): string | undefined {
  try {
    const url = new URL(apiUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function getEffectiveApiCredential(): EffectiveApiCredential {
  const fileConfig = readFileConfig();
  if (process.env.T3X_API_KEY) {
    return {
      apiKey: process.env.T3X_API_KEY,
      trustedOrigin: getHttpOrigin(process.env.T3X_API_URL || DEFAULT_API_URL),
    };
  }
  return {
    apiKey: fileConfig.api_key,
    trustedOrigin: fileConfig.api_key_origin,
  };
}
