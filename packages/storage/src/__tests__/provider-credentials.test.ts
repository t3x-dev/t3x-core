import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyDB } from '../adapters';
import { encryptCredential } from '../lib/credential-encryption';
import * as queries from '../queries';
import { getGlobalSetting } from '../queries/global-settings';
import {
  deleteProviderCredential,
  getProviderCredentialBundle,
  updateProviderCredentialTestResult,
  upsertProviderCredential,
} from '../queries/provider-credentials';
import { globalSettings } from '../schema';
import { createTestDB } from './setup';

describe('provider credentials', () => {
  let db: AnyDB;
  let sql: Awaited<ReturnType<typeof createTestDB>>['sql'];
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    const env = await createTestDB();
    db = env.db;
    sql = env.sql;
    cleanup = env.cleanup;
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = null;
  });

  it('round-trips a local provider credential without leaking secret in safe metadata', async () => {
    await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: 'sk-local-openai',
      defaultModel: 'gpt-4o-mini',
    });

    const bundle = await getProviderCredentialBundle(db);

    expect(bundle.secrets.OPENAI_API_KEY).toBe('sk-local-openai');
    expect(bundle.safe.openai?.configured).toBe(true);
    expect(bundle.safe.openai?.defaultModel).toBe('gpt-4o-mini');
    expect(JSON.stringify(bundle.safe)).not.toContain('sk-local-openai');
  });

  it('exports provider credential helpers through the queries entrypoint', () => {
    expect(queries.getProviderCredentialBundle).toBeTypeOf('function');
    expect(queries.upsertProviderCredential).toBeTypeOf('function');
    expect(queries.updateProviderCredentialTestResult).toBeTypeOf('function');
    expect(queries.deleteProviderCredential).toBeTypeOf('function');
  });

  it('keeps provider entries independent in global_settings', async () => {
    await upsertProviderCredential(db, {
      providerId: 'anthropic',
      apiKey: 'sk-ant-local',
      defaultModel: 'claude-sonnet-4-20250514',
    });
    await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: 'sk-openai-local',
      defaultModel: 'gpt-4o-mini',
    });

    const bundle = await getProviderCredentialBundle(db);
    expect(bundle.secrets.ANTHROPIC_API_KEY).toBe('sk-ant-local');
    expect(bundle.secrets.OPENAI_API_KEY).toBe('sk-openai-local');
  });

  it('removes a provider credential cleanly', async () => {
    await upsertProviderCredential(db, {
      providerId: 'anthropic',
      apiKey: 'sk-ant-local',
      defaultModel: 'claude-sonnet-4-20250514',
    });
    await deleteProviderCredential(db, 'anthropic');

    const bundle = await getProviderCredentialBundle(db);
    expect(bundle.secrets.ANTHROPIC_API_KEY).toBeUndefined();
    expect(bundle.safe.anthropic?.configured).toBe(false);
  });

  it('redacts raw api keys from lastTestError in safe metadata', async () => {
    const rawKey = 'sk-openai-sensitive-key';

    const { revisions } = await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: rawKey,
      defaultModel: 'gpt-4o-mini',
    });
    await updateProviderCredentialTestResult(db, 'openai', {
      expectedRevision: revisions.openai!,
      lastTestStatus: 'error',
      lastTestError: `provider auth failed for ${rawKey}`,
    });

    const bundle = await getProviderCredentialBundle(db);

    expect(bundle.safe.openai?.lastTestError).toBe('[redacted]');
    expect(bundle.safe.openai?.lastTestError).not.toContain(rawKey);
    expect(JSON.stringify(bundle.safe)).not.toContain(rawKey);
  });

  it('does not leak old or new raw keys after rotation', async () => {
    const oldKey = 'sk-openai-old-key';
    const newKey = 'sk-openai-new-key';

    const { revisions } = await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: oldKey,
      defaultModel: 'gpt-4o-mini',
    });
    await updateProviderCredentialTestResult(db, 'openai', {
      expectedRevision: revisions.openai!,
      lastTestStatus: 'error',
      lastTestError: `provider auth failed for ${oldKey}`,
    });
    await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: newKey,
      defaultModel: 'gpt-4o-mini',
    });

    const bundle = await getProviderCredentialBundle(db);

    expect(bundle.secrets.OPENAI_API_KEY).toBe(newKey);
    expect(bundle.safe.openai?.lastTestError).toBeNull();
    expect(bundle.safe.openai?.lastTestStatus).toBeNull();
    expect(bundle.safe.openai?.lastTestedAt).toBeNull();
    expect(JSON.stringify(bundle.safe)).not.toContain(oldKey);
    expect(JSON.stringify(bundle.safe)).not.toContain(newKey);

    const persisted = await getGlobalSetting<Record<string, unknown>>(
      db,
      'local_provider_credentials_v1_openai'
    );
    expect(persisted).toBeDefined();
    expect(JSON.stringify(persisted)).not.toContain(oldKey);
    expect(JSON.stringify(persisted)).not.toContain(newKey);
    expect((persisted as { credentialVersion?: number }).credentialVersion).toBe(2);
    expect((persisted as { encryptedApiKey?: string }).encryptedApiKey).toMatch(/^t3xenc:v1:/);
    expect((persisted as { lastTestError?: string }).lastTestError).toBeNull();
  });

  it('lazily migrates a legacy plaintext provider credential', async () => {
    await queries.setGlobalSetting(db, 'local_provider_credentials_v1_openai', {
      apiKey: 'legacy-provider-secret',
      defaultModel: 'gpt-4o-mini',
      updatedAt: new Date().toISOString(),
      lastTestStatus: null,
      lastTestedAt: null,
      lastTestError: null,
    });

    const bundle = await getProviderCredentialBundle(db);
    expect(bundle.secrets.OPENAI_API_KEY).toBe('legacy-provider-secret');

    const persisted = await getGlobalSetting<Record<string, unknown>>(
      db,
      'local_provider_credentials_v1_openai'
    );
    expect(JSON.stringify(persisted)).not.toContain('legacy-provider-secret');
    expect(persisted?.encryptedApiKey).toMatch(/^t3xenc:v1:/);
  });

  it('does not recreate a deleted credential when its connection test finishes', async () => {
    const { revisions } = await upsertProviderCredential(db, {
      providerId: 'google',
      apiKey: 'deleted-test-key',
    });
    await deleteProviderCredential(db, 'google');
    const bundle = await updateProviderCredentialTestResult(db, 'google', {
      expectedRevision: revisions.google!,
      lastTestStatus: 'ok',
    });
    expect(bundle.safe.google.configured).toBe(false);
    expect(bundle.revisions.google).toBeNull();
    expect(await getGlobalSetting(db, 'local_provider_credentials_v1_google')).toBeNull();
  });

  it.each([
    'replacement',
    'same key',
    'delete and recreate',
    'A to B to A',
  ])('ignores an old test after %s, even when the secret is unchanged', async (change) => {
    const first = await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: 'first-test-key',
    });
    if (change === 'delete and recreate') await deleteProviderCredential(db, 'openai');
    if (change === 'A to B to A')
      await upsertProviderCredential(db, { providerId: 'openai', apiKey: 'intermediate-key' });
    const currentKey = change === 'replacement' ? 'replacement-key' : 'first-test-key';
    const current = await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: currentKey,
      defaultModel: 'new-default-model',
    });
    const result = await updateProviderCredentialTestResult(db, 'openai', {
      expectedRevision: first.revisions.openai!,
      lastTestStatus: 'ok',
    });
    expect(result.secrets.OPENAI_API_KEY).toBe(currentKey);
    expect(result.revisions.openai).toBe(current.revisions.openai);
    expect(result.safe.openai).toMatchObject({
      defaultModel: 'new-default-model',
      lastTestStatus: null,
      lastTestedAt: null,
    });
  });

  it.each([
    'test result',
    'legacy rotation',
    'legacy deletion',
  ])('atomically protects a concurrent credential change during %s', async (operation) => {
    const first = await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: 'first-test-key',
    });
    const key = 'local_provider_credentials_v1_openai';
    if (operation !== 'test result') {
      await queries.setGlobalSetting(db, key, { apiKey: 'legacy-key' });
    }
    const replacement = JSON.stringify({
      credentialVersion: 2,
      encryptedApiKey: encryptCredential('replacement-key', 'provider:openai:api-key'),
      defaultModel: 'replacement-model',
      updatedAt: new Date().toISOString(),
      lastTestStatus: null,
    });
    let pending: ReturnType<typeof updateProviderCredentialTestResult> | undefined;
    try {
      await db.transaction(async (tx) => {
        // Hold the replacement uncommitted: the test reads the old row, then blocks on its write.
        if (operation === 'legacy deletion') {
          await tx.delete(globalSettings).where(eq(globalSettings.key, key));
        } else {
          await tx
            .update(globalSettings)
            .set({ value: replacement })
            .where(eq(globalSettings.key, key));
        }
        pending =
          operation === 'test result'
            ? updateProviderCredentialTestResult(db, 'openai', {
                expectedRevision: first.revisions.openai!,
                lastTestStatus: 'ok',
              })
            : getProviderCredentialBundle(db);
        await vi.waitFor(
          async () => {
            const [row] = await sql<{ waiting: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND wait_event_type = 'Lock'
                AND query ILIKE '%global_settings%') AS waiting
          `;
            expect(row.waiting).toBe(true);
          },
          { timeout: 5000 }
        );
      });
      const result = await pending;
      if (operation === 'legacy deletion') {
        expect(result?.secrets.OPENAI_API_KEY).toBeUndefined();
        expect(result?.revisions.openai).toBeNull();
      } else {
        expect(result?.secrets.OPENAI_API_KEY).toBe('replacement-key');
        expect(result?.safe.openai).toMatchObject({
          defaultModel: 'replacement-model',
          lastTestStatus: null,
        });
      }
    } finally {
      await pending;
    }
  });

  it('preserves the encrypted secret when recording a matching test result', async () => {
    const { revisions } = await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: 'matching-test-key',
    });
    const before = await getGlobalSetting<Record<string, unknown>>(
      db,
      'local_provider_credentials_v1_openai'
    );
    const result = await updateProviderCredentialTestResult(db, 'openai', {
      expectedRevision: revisions.openai!,
      lastTestStatus: 'ok',
    });
    const after = await getGlobalSetting<Record<string, unknown>>(
      db,
      'local_provider_credentials_v1_openai'
    );
    expect(after?.encryptedApiKey).toBe(before?.encryptedApiKey);
    expect(result.safe.openai.lastTestStatus).toBe('ok');
    expect(result.safe.openai.lastTestedAt).toBeTruthy();
  });

  it.each([
    '{broken-json-private-fragment',
    'null',
    'false',
    '[]',
    '{}',
    '{"apiKey":42}',
    '{"apiKey":""}',
    '{"encryptedApiKey":null,"apiKey":"legacy"}',
  ])('rejects a corrupt stored record instead of treating it as absent: %s', async (value) => {
    const key = 'local_provider_credentials_v1_openai';
    await queries.setGlobalSetting(db, key, value);
    await expect(getProviderCredentialBundle(db)).rejects.toThrow(/Stored provider credential/);
    await expect(
      upsertProviderCredential(db, {
        providerId: 'openai',
        apiKey: 'must-not-overwrite-corruption',
      })
    ).rejects.toThrow();
    const [row] = await db.select().from(globalSettings).where(eq(globalSettings.key, key));
    expect(row.value).toBe(value);
  });

  it('accepts the google-ai alias as the local google provider family', async () => {
    await upsertProviderCredential(db, {
      providerId: 'google-ai',
      apiKey: 'sk-google-local',
      defaultModel: 'gemini-2.5-pro',
    });

    const bundle = await getProviderCredentialBundle(db);

    expect(bundle.secrets.GOOGLE_AI_STUDIO_KEY).toBe('sk-google-local');
    expect(bundle.safe.google?.configured).toBe(true);
  });
});
