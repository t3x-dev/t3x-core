// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import { fetchAvailableModels } from '@/queries/llm';
import { fetchLocalProviderStatus } from '@/queries/providerStatus';

vi.mock('@/queries/llm', () => ({ fetchAvailableModels: vi.fn() }));
vi.mock('@/queries/providerStatus', () => ({ fetchLocalProviderStatus: vi.fn() }));
const model = (id: string) => ({ id, label: id, capabilities: ['text'], max_output_tokens: 4096 });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchLocalProviderStatus).mockRejectedValue(new Error('Forbidden'));
});
it.each([
  'openai',
  'managed',
])('uses available %s inference without credential administration', async (provider) => {
  vi.mocked(fetchAvailableModels).mockResolvedValue({
    generation_provider_order: [provider],
    default_provider: provider,
    providers: [{ name: provider, label: provider, available: true, models: [model('balanced')] }],
  });
  const { result } = renderHook(() => useAvailableModels());
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.hasConfiguredGenerationProvider).toBe(true);
  expect(result.current.defaultProvider).toBe(provider);
  expect(result.current.defaultModel).toBe('balanced');
  expect(fetchLocalProviderStatus).not.toHaveBeenCalled();
});
it('preserves backend ordering and the selected provider default', async () => {
  vi.mocked(fetchAvailableModels).mockResolvedValue({
    generation_provider_order: ['google', 'openai'],
    default_provider: 'google',
    providers: [
      { name: 'openai', label: 'OpenAI', available: true, models: [model('gpt')] },
      {
        name: 'google',
        label: 'Google',
        available: true,
        default_model: 'pro',
        models: [model('flash'), model('pro')],
      },
      { name: 'anthropic', label: 'Anthropic', available: false, models: [model('claude')] },
    ],
  });
  const { result } = renderHook(() => useAvailableModels());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.providers.map((provider) => provider.name)).toEqual(['google', 'openai']);
  expect(result.current.defaultModel).toBe('pro');
});
it('distinguishes discovery failure from an empty catalog and retries without connecting', async () => {
  vi.mocked(fetchAvailableModels)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue({
      generation_provider_order: [],
      default_provider: null,
      providers: [],
    });
  const { result } = renderHook(() => useAvailableModels());
  await waitFor(() => expect(result.current.availabilityError).toBe('api_unavailable'));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.availabilityError).toBeNull());
  expect(result.current.hasConfiguredGenerationProvider).toBe(false);
});
