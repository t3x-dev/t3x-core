// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from '../../hooks/renderHook';

vi.mock('@/queries/providerStatus', () => ({
  fetchLocalProviderStatus: vi.fn(),
}));

import { useProviderStatus } from '@/hooks/providers/useProviderStatus';
import { fetchLocalProviderStatus } from '@/queries/providerStatus';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupRoots();
});

describe('useProviderStatus', () => {
  it('loads supported provider statuses from the query layer and derives defaults', async () => {
    vi.mocked(fetchLocalProviderStatus).mockImplementation(async (providerId: string) => {
      if (providerId === 'openai') {
        return {
          provider: 'openai',
          configured: true,
          default_model: 'gpt-4.1',
          last_test_status: 'ok',
          last_tested_at: null,
          last_test_error: null,
        } as never;
      }

      return {
        provider: providerId === 'anthropic' ? 'anthropic' : 'google',
        configured: false,
        default_model: null,
        last_test_status: null,
        last_tested_at: null,
        last_test_error: null,
      } as never;
    });

    const { result, unmount } = renderHook(() => useProviderStatus());

    expect(result.current.loading).toBe(true);
    await waitForHook();

    expect(fetchLocalProviderStatus).toHaveBeenCalledTimes(3);
    expect(result.current.loading).toBe(false);
    expect(result.current.configuredProviders.map((status) => status.provider)).toEqual(['openai']);
    expect(result.current.hasConfiguredGenerationProvider).toBe(true);
    expect(result.current.defaultProvider).toBe('openai');
    expect(result.current.defaultModel).toBe('gpt-4.1');

    unmount();
  });
});
