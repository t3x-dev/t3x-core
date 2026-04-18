import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/misc', () => ({
  deleteLocalProvider: vi.fn(),
  testProvider: vi.fn(),
  updateProjectProviderConfig: vi.fn(),
  updateProviderRoles: vi.fn(),
  upsertLocalProvider: vi.fn(),
}));

import {
  removeLocalProviderCredential,
  runProviderConnectionTest,
  saveLocalProviderCredential,
  saveProjectProviderConfig,
  saveProviderRoles,
} from '@/commands/providers';
import {
  deleteLocalProvider,
  testProvider,
  updateProjectProviderConfig,
  updateProviderRoles,
  upsertLocalProvider,
} from '@/infrastructure/misc';

describe('commands/providers', () => {
  it('delegates provider writes to infrastructure', async () => {
    vi.mocked(upsertLocalProvider).mockResolvedValue({ configured: true } as never);
    vi.mocked(deleteLocalProvider).mockResolvedValue({ configured: false } as never);
    vi.mocked(testProvider).mockResolvedValue({ ok: true } as never);
    vi.mocked(updateProviderRoles).mockResolvedValue([] as never);
    vi.mocked(updateProjectProviderConfig).mockResolvedValue(null as never);

    await expect(
      saveLocalProviderCredential('openai', { api_key: 'sk-test', default_model: 'gpt-4.1' })
    ).resolves.toEqual({ configured: true });
    await expect(removeLocalProviderCredential('openai')).resolves.toEqual({ configured: false });
    await expect(runProviderConnectionTest('openai')).resolves.toEqual({ ok: true });
    await expect(saveProviderRoles([])).resolves.toEqual([]);
    await expect(saveProjectProviderConfig('proj_123', null)).resolves.toBeNull();

    expect(upsertLocalProvider).toHaveBeenCalledWith('openai', {
      api_key: 'sk-test',
      default_model: 'gpt-4.1',
    });
    expect(deleteLocalProvider).toHaveBeenCalledWith('openai');
    expect(testProvider).toHaveBeenCalledWith('openai');
    expect(updateProviderRoles).toHaveBeenCalledWith([]);
    expect(updateProjectProviderConfig).toHaveBeenCalledWith('proj_123', null);
  });
});
