import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ bundle: vi.fn(), db: vi.fn() }));
vi.mock('@t3x-dev/storage', () => ({ getProviderCredentialBundle: mocks.bundle }));
vi.mock('../lib/db', () => ({ getDB: mocks.db }));

import { loadResolvedProviderConfig } from '../lib/provider-config';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.mockResolvedValue({});
});
it('returns only database overrides, preserving the registry environment fallback when absent', async () => {
  mocks.bundle.mockResolvedValue({ secrets: {} });
  expect(await loadResolvedProviderConfig()).toEqual({});
  mocks.bundle.mockResolvedValue({ secrets: { OPENAI_API_KEY: 'isolated-test-database-key' } });
  expect(await loadResolvedProviderConfig()).toEqual({
    OPENAI_API_KEY: 'isolated-test-database-key',
  });
});
it.each([
  'database unavailable',
  'credential decryption failed',
])('propagates %s rather than silently falling back', async (message) => {
  mocks.bundle.mockRejectedValue(new Error(message));
  await expect(loadResolvedProviderConfig()).rejects.toThrow(message);
});
