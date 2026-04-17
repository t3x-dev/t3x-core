import type { ResolvedConfig } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import { deleteGlobalSetting, getGlobalSetting, setGlobalSetting } from './global-settings';

const PROVIDER_CREDENTIALS_KEY = 'local_provider_credentials_v1';

export type LocalProviderId = 'anthropic' | 'openai' | 'google';

type ProviderTestStatus = 'ok' | 'error';

interface StoredProviderCredential {
  apiKey: string;
  defaultModel: string | null;
  updatedAt: string;
  lastTestStatus: ProviderTestStatus | null;
  lastTestedAt: string | null;
  lastTestError: string | null;
}

type ProviderCredentialStore = Partial<Record<LocalProviderId, StoredProviderCredential>>;

type ProviderCredentialSafe = {
  configured: boolean;
  defaultModel: string | null;
  lastTestStatus: ProviderTestStatus | null;
  lastTestedAt: string | null;
  lastTestError: string | null;
};

export interface ProviderCredentialBundle {
  secrets: ResolvedConfig;
  safe: Record<LocalProviderId, ProviderCredentialSafe>;
}

export interface UpsertProviderCredentialInput {
  providerId: LocalProviderId;
  apiKey: string;
  defaultModel?: string | null;
}

export interface UpdateProviderCredentialTestResultInput {
  lastTestStatus: ProviderTestStatus;
  lastTestedAt?: Date | string | null;
  lastTestError?: string | null;
}

const ENV_KEY_BY_PROVIDER: Record<LocalProviderId, keyof ResolvedConfig> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_STUDIO_KEY',
};

const LOCAL_PROVIDER_IDS: readonly LocalProviderId[] = ['anthropic', 'openai', 'google'];

function createEmptySafeState(): Record<LocalProviderId, ProviderCredentialSafe> {
  return {
    anthropic: {
      configured: false,
      defaultModel: null,
      lastTestStatus: null,
      lastTestedAt: null,
      lastTestError: null,
    },
    openai: {
      configured: false,
      defaultModel: null,
      lastTestStatus: null,
      lastTestedAt: null,
      lastTestError: null,
    },
    google: {
      configured: false,
      defaultModel: null,
      lastTestStatus: null,
      lastTestedAt: null,
      lastTestError: null,
    },
  };
}

function normalizeProviderId(providerId: string): LocalProviderId {
  if (!LOCAL_PROVIDER_IDS.includes(providerId as LocalProviderId)) {
    throw new Error(`Unsupported local provider id: ${providerId}`);
  }
  return providerId as LocalProviderId;
}

function normalizeTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function redactSecret(text: string | null, secret: string | null | undefined): string | null {
  if (!text || !secret) return text;
  return text.split(secret).join('[redacted]');
}

async function readProviderCredentialStore(db: AnyDB): Promise<ProviderCredentialStore> {
  return (await getGlobalSetting<ProviderCredentialStore>(db, PROVIDER_CREDENTIALS_KEY)) ?? {};
}

async function writeProviderCredentialStore(db: AnyDB, store: ProviderCredentialStore): Promise<void> {
  await setGlobalSetting(db, PROVIDER_CREDENTIALS_KEY, store);
}

export async function getProviderCredentialBundle(db: AnyDB): Promise<ProviderCredentialBundle> {
  const store = await readProviderCredentialStore(db);
  const secrets: ResolvedConfig = {};
  const safe = createEmptySafeState();

  for (const providerId of LOCAL_PROVIDER_IDS) {
    const entry = store[providerId];
    if (!entry) continue;

    if (entry.apiKey) {
      secrets[ENV_KEY_BY_PROVIDER[providerId]] = entry.apiKey;
    }

    safe[providerId] = {
      configured: Boolean(entry.apiKey),
      defaultModel: entry.defaultModel ?? null,
      lastTestStatus: entry.lastTestStatus ?? null,
      lastTestedAt: entry.lastTestedAt ?? null,
      lastTestError: redactSecret(entry.lastTestError, entry.apiKey),
    };
  }

  return { secrets, safe };
}

export async function upsertProviderCredential(
  db: AnyDB,
  input: UpsertProviderCredentialInput
): Promise<ProviderCredentialBundle> {
  const providerId = normalizeProviderId(input.providerId);
  const store = await readProviderCredentialStore(db);
  const now = new Date().toISOString();

  store[providerId] = {
    apiKey: input.apiKey,
    defaultModel: input.defaultModel ?? null,
    updatedAt: now,
    lastTestStatus: store[providerId]?.lastTestStatus ?? null,
    lastTestedAt: store[providerId]?.lastTestedAt ?? null,
    lastTestError: redactSecret(store[providerId]?.lastTestError ?? null, input.apiKey),
  };

  await writeProviderCredentialStore(db, store);
  return getProviderCredentialBundle(db);
}

export async function updateProviderCredentialTestResult(
  db: AnyDB,
  providerId: LocalProviderId,
  input: UpdateProviderCredentialTestResultInput
): Promise<ProviderCredentialBundle> {
  providerId = normalizeProviderId(providerId);
  const store = await readProviderCredentialStore(db);
  const existing = store[providerId];

  if (!existing) {
    return getProviderCredentialBundle(db);
  }

  store[providerId] = {
    ...existing,
    lastTestStatus: input.lastTestStatus,
    lastTestedAt: normalizeTimestamp(input.lastTestedAt ?? new Date()),
    lastTestError: redactSecret(input.lastTestError ?? null, existing.apiKey),
    updatedAt: new Date().toISOString(),
  };

  await writeProviderCredentialStore(db, store);
  return getProviderCredentialBundle(db);
}

export async function deleteProviderCredential(
  db: AnyDB,
  providerId: LocalProviderId
): Promise<ProviderCredentialBundle> {
  providerId = normalizeProviderId(providerId);
  const store = await readProviderCredentialStore(db);

  delete store[providerId];
  if (Object.keys(store).length === 0) {
    await deleteGlobalSetting(db, PROVIDER_CREDENTIALS_KEY);
  } else {
    await writeProviderCredentialStore(db, store);
  }

  return getProviderCredentialBundle(db);
}
