import { createHash } from 'node:crypto';
import type { ResolvedConfig } from '@t3x-dev/core';
import { and, eq, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  CredentialEncryptionError,
  decryptCredential,
  encryptCredential,
} from '../lib/credential-encryption';
import { globalSettings } from '../schema';
import { deleteGlobalSetting, setGlobalSetting } from './global-settings';

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

interface PersistedProviderCredential extends Omit<StoredProviderCredential, 'apiKey'> {
  credentialVersion?: 2;
  encryptedApiKey?: string;
  /** Legacy v1 field, migrated on first read when an encryption key is configured. */
  apiKey?: string;
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
  /** Server-only versions of the records supplying these secrets; never API status fields. */
  revisions: Record<LocalProviderId, string | null>;
}

export interface UpsertProviderCredentialInput {
  providerId: LocalProviderIdInput;
  apiKey: string;
  defaultModel?: string | null;
}

export interface UpdateProviderCredentialTestResultInput {
  expectedRevision: string;
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
): Promise<{ credential: StoredProviderCredential; value: string } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await db
      .select({ value: globalSettings.value })
      .from(globalSettings)
      .where(eq(globalSettings.key, providerCredentialKey(providerId)))
      .limit(1);
    // Only an absent row permits environment fallback. Corrupt JSON must fail closed.
    if (!row) return null;
    let persisted: PersistedProviderCredential;
    try {
      persisted = JSON.parse(row.value);
    } catch {
      throw new CredentialEncryptionError('Stored provider credential JSON is malformed');
    }
    if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) {
      throw new CredentialEncryptionError('Stored provider credential record is malformed');
    }
    const storedSecret =
      persisted.encryptedApiKey !== undefined ? persisted.encryptedApiKey : persisted.apiKey;
    if (typeof storedSecret !== 'string' || !storedSecret.trim()) {
      throw new CredentialEncryptionError('Stored provider credential is missing its secret');
    }
    if (persisted.encryptedApiKey !== undefined && !storedSecret.startsWith('t3xenc:v1:')) {
      throw new CredentialEncryptionError('Encrypted provider credential is malformed');
    }
    const decrypted = decryptCredential(storedSecret, `provider:${providerId}:api-key`);
    if (!decrypted.plaintext.trim()) {
      throw new CredentialEncryptionError('Stored provider credential is missing its secret');
    }
    const credential: StoredProviderCredential = {
      apiKey: decrypted.plaintext,
      defaultModel: persisted.defaultModel ?? null,
      updatedAt: persisted.updatedAt,
      lastTestStatus: persisted.lastTestStatus ?? null,
      lastTestedAt: persisted.lastTestedAt ?? null,
      lastTestError: persisted.lastTestError ?? null,
    };

    if (persisted.apiKey !== undefined || decrypted.needsRotation) {
      const value = serializeProviderCredential(providerId, credential);
      // Lazy encryption/rotation must not restore a concurrently replaced or deleted key either.
      if (!(await replaceProviderCredential(db, providerId, row.value, value))) continue;
      return { credential, value };
    }
    return { credential, value: row.value };
  }
  throw new Error('Provider credential changed during encryption rotation; retry the operation');
}

function serializeProviderCredential(
  providerId: LocalProviderId,
  credential: StoredProviderCredential
): string {
  const { apiKey, ...metadata } = credential;
  return JSON.stringify({
    credentialVersion: 2,
    encryptedApiKey: encryptCredential(apiKey, `provider:${providerId}:api-key`),
    ...metadata,
  } satisfies PersistedProviderCredential);
}

function credentialRevision(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function replaceProviderCredential(
  db: AnyDB,
  providerId: LocalProviderId,
  expectedValue: string,
  value: string
): Promise<boolean> {
  const updated = await db
    .update(globalSettings)
    .set({ value, updatedAt: new Date() })
    .where(
      and(
        eq(globalSettings.key, providerCredentialKey(providerId)),
        // Hash comparison avoids placing a legacy plaintext record in SQL parameters/errors.
        sql`encode(sha256(convert_to(${globalSettings.value}, 'UTF8')), 'hex') = ${credentialRevision(expectedValue)}`
      )
    )
    .returning({ key: globalSettings.key });
  return updated.length > 0;
}

export async function getProviderCredentialBundle(db: AnyDB): Promise<ProviderCredentialBundle> {
  const secrets: ResolvedConfig = {};
  const safe = createEmptySafeState();
  const revisions: ProviderCredentialBundle['revisions'] = {
    anthropic: null,
    openai: null,
    google: null,
  };

  for (const providerId of LOCAL_PROVIDER_IDS) {
    const record = await readProviderCredential(db, providerId);
    if (!record) continue;
    const entry = record.credential;
    revisions[providerId] = credentialRevision(record.value);

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

  return { secrets, safe, revisions };
}

export async function upsertProviderCredential(
  db: AnyDB,
  input: UpsertProviderCredentialInput
): Promise<ProviderCredentialBundle> {
  const providerId = normalizeProviderId(input.providerId);
  const now = new Date().toISOString();
  // Check the existing encrypted record before replacing it; a broken master key
  // must not turn a credential update into silent data loss.
  await readProviderCredential(db, providerId);

  await setGlobalSetting(
    db,
    providerCredentialKey(providerId),
    serializeProviderCredential(providerId, {
      apiKey: input.apiKey,
      defaultModel: input.defaultModel ?? null,
      updatedAt: now,
      lastTestStatus: null,
      lastTestedAt: null,
      lastTestError: null,
    })
  );
  return getProviderCredentialBundle(db);
}

export async function updateProviderCredentialTestResult(
  db: AnyDB,
  providerId: LocalProviderIdInput,
  input: UpdateProviderCredentialTestResultInput
): Promise<ProviderCredentialBundle> {
  providerId = normalizeProviderId(providerId);
  const existing = await readProviderCredential(db, providerId);

  if (!existing || credentialRevision(existing.value) !== input.expectedRevision) {
    return getProviderCredentialBundle(db);
  }

  // Preserve the encrypted envelope and update only metadata for the exact tested record.
  // The SQL revision predicate also closes the race between this read and the write.
  const updated = {
    ...JSON.parse(existing.value),
    lastTestStatus: input.lastTestStatus,
    lastTestedAt: normalizeTimestamp(input.lastTestedAt ?? new Date()),
    lastTestError: input.lastTestError ? SAFE_LAST_TEST_ERROR : null,
    updatedAt: new Date().toISOString(),
  };
  await replaceProviderCredential(db, providerId, existing.value, JSON.stringify(updated));
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
