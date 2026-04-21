import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/misc', () => ({
  getProjectProviderConfig: vi.fn(),
  getProviderRoles: vi.fn(),
  listProviders: vi.fn(),
}));

import { getProjectProviderConfig, getProviderRoles, listProviders } from '@/infrastructure/misc';
import {
  fetchProjectProviderConfig,
  fetchProviderRoles,
  fetchProviders,
} from '@/queries/providers';

describe('queries/providers', () => {
  it('delegates provider reads to infrastructure', async () => {
    vi.mocked(listProviders).mockResolvedValue([] as never);
    vi.mocked(getProviderRoles).mockResolvedValue([] as never);
    vi.mocked(getProjectProviderConfig).mockResolvedValue(null as never);

    await expect(fetchProviders()).resolves.toEqual([]);
    await expect(fetchProviderRoles()).resolves.toEqual([]);
    await expect(fetchProjectProviderConfig('proj_123')).resolves.toBeNull();

    expect(listProviders).toHaveBeenCalledTimes(1);
    expect(getProviderRoles).toHaveBeenCalledTimes(1);
    expect(getProjectProviderConfig).toHaveBeenCalledWith('proj_123');
  });

  it('hides unsupported generation providers from web provider reads', async () => {
    vi.mocked(listProviders).mockResolvedValue([
      { id: 'anthropic', role: 'generation' },
      { id: 'openai', role: 'generation' },
      { id: 'google-ai', role: 'generation' },
      { id: 'deepseek', role: 'generation' },
      { id: 'ollama', role: 'generation' },
      { id: 'google-ai-embedding', role: 'embedding' },
    ] as never);

    vi.mocked(getProviderRoles).mockResolvedValue([
      {
        role: 'generation',
        provider_ids: ['anthropic', 'deepseek', 'openai', 'ollama', 'google-ai'],
      },
      {
        role: 'embedding',
        provider_ids: ['google-ai-embedding'],
      },
    ] as never);

    await expect(fetchProviders()).resolves.toEqual([
      { id: 'anthropic', role: 'generation' },
      { id: 'openai', role: 'generation' },
      { id: 'google-ai', role: 'generation' },
      { id: 'google-ai-embedding', role: 'embedding' },
    ]);

    await expect(fetchProviderRoles()).resolves.toEqual([
      {
        role: 'generation',
        provider_ids: ['anthropic', 'openai', 'google-ai'],
      },
      {
        role: 'embedding',
        provider_ids: ['google-ai-embedding'],
      },
    ]);
  });
});
