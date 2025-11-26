import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ensureDir, pathExists } from '../utils/fs';

export type StorageMode = 'jsonl' | 'sqlite' | 'both';

export interface UserConfig {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  defaultModel?: string;
  proxyUrl?: string;
  storageMode?: StorageMode;
  insight?: {
    embedModel?: string;
  };
  search?: {
    rerank?: boolean;
  };
  trace?: {
    sql?: boolean;
    events?: boolean;
  };
}

export interface ResolvedConfig {
  apiKey: string;
  model: string;
}

export interface AppPreferences {
  storageMode: StorageMode;
  insight: {
    embedModel: string;
  };
  search: {
    rerank: boolean;
  };
  trace: {
    sql: boolean;
    events: boolean;
  };
}

export const USER_CONFIG_DIR = path.join(os.homedir(), '.contextflow');
export const USER_CONFIG_JSON_PATH = path.join(USER_CONFIG_DIR, 'config.json');
const USER_CONFIG_YAML_PATH = path.join(USER_CONFIG_DIR, 'config.yml');
const USER_CONFIG_YML_PATH = path.join(USER_CONFIG_DIR, 'config.yaml');

export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_STORAGE_MODE: StorageMode = 'both';
const DEFAULT_EMBED_MODEL = 'MiniLM';

type CliOverrides = {
  storageMode?: StorageMode;
  traceSql?: boolean;
  traceEvents?: boolean;
};

const cliOverrides = parseCliArgs(process.argv);

export async function readUserConfig(): Promise<UserConfig> {
  const candidatePaths = [USER_CONFIG_YAML_PATH, USER_CONFIG_YML_PATH, USER_CONFIG_JSON_PATH];
  for (const candidate of candidatePaths) {
    if (!(await pathExists(candidate))) {
      continue;
    }
    const content = await fs.readFile(candidate, 'utf-8');
    try {
      if (candidate.endsWith('.json')) {
        return JSON.parse(content) as UserConfig;
      }
      const { parse } = await import('yaml');
      return (parse(content) ?? {}) as UserConfig;
    } catch (error) {
      throw new Error(`Failed to parse user config at ${candidate}: ${(error as Error).message}`);
    }
  }

  return {};
}

export async function writeUserConfig(config: UserConfig): Promise<void> {
  await ensureDir(USER_CONFIG_DIR);
  const serialized = JSON.stringify(config, null, 2);
  await fs.writeFile(USER_CONFIG_JSON_PATH, `${serialized}\n`, 'utf-8');
}

export async function resolveRuntimeConfig(overrides: {
  apiKey?: string;
  model?: string;
} = {}): Promise<ResolvedConfig> {
  const userConfig = await readUserConfig();
  const env = process.env;

  const apiKey =
    overrides.apiKey ??
    env.ANTHROPIC_API_KEY ??
    env.ANTHROPIC_APIKEY ??
    env.CLAUDE_API_KEY ??
    env.OPENAI_API_KEY ??
    env.OPENAI_APIKEY ??
    userConfig.ANTHROPIC_API_KEY ??
    userConfig.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY 未设置。\n请在 contextflow CLI 中使用 /config -> /api <your_key>\n或设置环境变量: export ANTHROPIC_API_KEY=...',
    );
  }

  const model =
    overrides.model ??
    env.CLAUDE_MODEL ??
    env.OPENAI_MODEL ??
    userConfig.defaultModel ??
    DEFAULT_MODEL;

  return {
    apiKey,
    model,
  };
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  const config = await readUserConfig();
  const storageMode = resolveStorageModeValue(config);

  return {
    storageMode,
    insight: {
      embedModel: config.insight?.embedModel ?? DEFAULT_EMBED_MODEL,
    },
    search: {
      rerank: Boolean(config.search?.rerank ?? false),
    },
    trace: resolveTracePreferences(config),
  };
}

export function shouldUseJsonlStorage(mode: StorageMode): boolean {
  return mode === 'jsonl' || mode === 'both';
}

export function shouldUseSqliteStorage(mode: StorageMode): boolean {
  return mode === 'sqlite' || mode === 'both';
}

function resolveStorageModeValue(config: UserConfig): StorageMode {
  const envValueRaw = process.env.CONTEXTFLOW_STORAGE_MODE;
  const envValue = isValidStorageMode(envValueRaw?.toLowerCase()) ? (envValueRaw?.toLowerCase() as StorageMode) : undefined;
  return (
    cliOverrides.storageMode ??
    envValue ??
    config.storageMode ??
    DEFAULT_STORAGE_MODE
  );
}

function resolveTracePreferences(config: UserConfig): { sql: boolean; events: boolean } {
  const fromConfig = config.trace ?? {};
  return {
    sql: cliOverrides.traceSql ?? Boolean(fromConfig.sql),
    events: cliOverrides.traceEvents ?? Boolean(fromConfig.events),
  };
}

function parseCliArgs(argv: string[]): CliOverrides {
  const overrides: CliOverrides = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    if (arg.startsWith('--storage-mode')) {
      const value = extractValue(arg, argv[i + 1]);
      if (isValidStorageMode(value)) {
        overrides.storageMode = value as StorageMode;
      }
      if (!arg.includes('=')) {
        i += 1;
      }
      continue;
    }
    if (arg === '--trace' || arg.startsWith('--trace=')) {
      const value = extractValue(arg, argv[i + 1]);
      if (!arg.includes('=')) {
        i += 1;
      }
      if (!value) {
        continue;
      }
      value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .forEach((flag) => {
          if (flag === 'sql') {
            overrides.traceSql = true;
          }
          if (flag === 'events') {
            overrides.traceEvents = true;
          }
        });
    }
  }
  return overrides;
}

function extractValue(current: string, next?: string): string | undefined {
  if (current.includes('=')) {
    return current.split('=').slice(1).join('=').trim();
  }
  return next;
}

function isValidStorageMode(value?: string): value is StorageMode {
  if (!value) {
    return false;
  }
  return value === 'jsonl' || value === 'sqlite' || value === 'both';
}
