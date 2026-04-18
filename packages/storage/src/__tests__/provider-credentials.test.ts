import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { getGlobalSetting } from '../queries/global-settings';
import * as queries from '../queries';
import { createTestDB } from './setup';
import {
  deleteProviderCredential,
  getProviderCredentialBundle,
  updateProviderCredentialTestResult,
  upsertProviderCredential,
} from '../queries/provider-credentials';

describe('provider credentials', () => {
  let db: AnyDB;
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    const env = await createTestDB();
    db = env.db;
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

    await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: rawKey,
      defaultModel: 'gpt-4o-mini',
    });
    await updateProviderCredentialTestResult(db, 'openai', {
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

    await upsertProviderCredential(db, {
      providerId: 'openai',
      apiKey: oldKey,
      defaultModel: 'gpt-4o-mini',
    });
    await updateProviderCredentialTestResult(db, 'openai', {
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
    expect(bundle.safe.openai?.lastTestError).toBe('[redacted]');
    expect(JSON.stringify(bundle.safe)).not.toContain(oldKey);
    expect(JSON.stringify(bundle.safe)).not.toContain(newKey);

    const persisted = await getGlobalSetting<Record<string, unknown>>(
      db,
      'local_provider_credentials_v1_openai'
    );
    expect(persisted).toBeDefined();
    expect(JSON.stringify(persisted)).not.toContain(oldKey);
    expect(JSON.stringify(persisted)).toContain(newKey);
    expect((persisted as { lastTestError?: string }).lastTestError).toBe('[redacted]');
  });

  it('throws when updating test result for a missing provider credential', async () => {
    await expect(
      updateProviderCredentialTestResult(db, 'google', {
        lastTestStatus: 'error',
        lastTestError: 'provider unavailable',
      })
    ).rejects.toThrow('Provider credential not found for google');
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
