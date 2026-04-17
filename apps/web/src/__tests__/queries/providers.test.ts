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
});
