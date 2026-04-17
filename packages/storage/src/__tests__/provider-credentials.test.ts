import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
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

    expect(bundle.safe.openai?.lastTestError).toContain('[redacted]');
    expect(bundle.safe.openai?.lastTestError).not.toContain(rawKey);
    expect(JSON.stringify(bundle.safe)).not.toContain(rawKey);
  });
});
