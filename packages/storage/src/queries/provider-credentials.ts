import type { ResolvedConfig } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import { deleteGlobalSetting, getGlobalSetting, setGlobalSetting } from './global-settings';

const PROVIDER_CREDENTIAL_KEY_PREFIX = 'local_provider_credentials_v1_';
const SAFE_LAST_TEST_ERROR = '[redacted]';

// Task 1 models local provider family IDs, not the full runtime provider registry.
export type LocalProviderId = 'anthropic' | 'openai' | 'google';
type LocalProviderIdInput = LocalProviderId | 'google-ai';

type ProviderTestStatus = 'ok' | 'error';

interface StoredProviderCredential {
  apiKey: string;
  defaultModel: string | null;
  updatedAt: string;
  lastTestStatus: ProviderTestStatus | null;
  lastTestedAt: string | null;
  lastTestError: string | null;
}

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
  providerId: LocalProviderIdInput;
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

function normalizeProviderId(providerId: LocalProviderIdInput | string): LocalProviderId {
  if (providerId === 'google-ai') {
    return 'google';
  }

  if (!LOCAL_PROVIDER_IDS.includes(providerId as LocalProviderId)) {
    throw new Error(`Unsupported local provider family id: ${providerId}`);
  }
  return providerId as LocalProviderId;
}

function normalizeTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toSafeLastTestError(lastTestError: string | null): string | null {
  return lastTestError ? SAFE_LAST_TEST_ERROR : null;
}

function providerCredentialKey(providerId: LocalProviderId): string {
  return `${PROVIDER_CREDENTIAL_KEY_PREFIX}${providerId}`;
}

async function readProviderCredential(
  db: AnyDB,
  providerId: LocalProviderId
): Promise<StoredProviderCredential | null> {
  return (await getGlobalSetting<StoredProviderCredential>(db, providerCredentialKey(providerId))) ?? null;
}

async function writeProviderCredential(
  db: AnyDB,
  providerId: LocalProviderId,
  credential: StoredProviderCredential
): Promise<void> {
  await setGlobalSetting(db, providerCredentialKey(providerId), credential);
}

export async function getProviderCredentialBundle(db: AnyDB): Promise<ProviderCredentialBundle> {
  const secrets: ResolvedConfig = {};
  const safe = createEmptySafeState();

  for (const providerId of LOCAL_PROVIDER_IDS) {
    const entry = await readProviderCredential(db, providerId);
    if (!entry) continue;

    if (entry.apiKey) {
      secrets[ENV_KEY_BY_PROVIDER[providerId]] = entry.apiKey;
    }

    safe[providerId] = {
      configured: Boolean(entry.apiKey),
      defaultModel: entry.defaultModel ?? null,
      lastTestStatus: entry.lastTestStatus ?? null,
      lastTestedAt: entry.lastTestedAt ?? null,
      lastTestError: toSafeLastTestError(entry.lastTestError),
    };
  }

  return { secrets, safe };
}

export async function upsertProviderCredential(
  db: AnyDB,
  input: UpsertProviderCredentialInput
): Promise<ProviderCredentialBundle> {
  const providerId = normalizeProviderId(input.providerId);
  const now = new Date().toISOString();
  const previous = await readProviderCredential(db, providerId);

  await writeProviderCredential(db, providerId, {
    apiKey: input.apiKey,
    defaultModel: input.defaultModel ?? null,
    updatedAt: now,
    lastTestStatus: previous?.lastTestStatus ?? null,
    lastTestedAt: previous?.lastTestedAt ?? null,
    lastTestError: toSafeLastTestError(previous?.lastTestError ?? null),
  });
  return getProviderCredentialBundle(db);
}

export async function updateProviderCredentialTestResult(
  db: AnyDB,
  providerId: LocalProviderIdInput,
  input: UpdateProviderCredentialTestResultInput
): Promise<ProviderCredentialBundle> {
  providerId = normalizeProviderId(providerId);
  const existing = await readProviderCredential(db, providerId);

  if (!existing) {
    throw new Error(`Provider credential not found for ${providerId}`);
  }

  await writeProviderCredential(db, providerId, {
    ...existing,
    lastTestStatus: input.lastTestStatus,
    lastTestedAt: normalizeTimestamp(input.lastTestedAt ?? new Date()),
    lastTestError: input.lastTestError ? SAFE_LAST_TEST_ERROR : null,
    updatedAt: new Date().toISOString(),
  });
  return getProviderCredentialBundle(db);
}

export async function deleteProviderCredential(
  db: AnyDB,
  providerId: LocalProviderIdInput
): Promise<ProviderCredentialBundle> {
  providerId = normalizeProviderId(providerId);
  await deleteGlobalSetting(db, providerCredentialKey(providerId));

  return getProviderCredentialBundle(db);
}
