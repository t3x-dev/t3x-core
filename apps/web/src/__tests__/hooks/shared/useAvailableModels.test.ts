// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from '../../hooks/renderHook';

vi.mock('@/infrastructure/llm', () => ({
  getAvailableModels: vi.fn(),
}));

vi.mock('@/infrastructure/misc', async () => {
  const actual =
    await vi.importActual<typeof import('@/infrastructure/misc')>('@/infrastructure/misc');
  return {
    ...actual,
    getLocalProviderStatus: vi.fn(),
  };
});

import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import { getAvailableModels } from '@/infrastructure/llm';
import { getLocalProviderStatus } from '@/infrastructure/misc';

function makeModel(id: string, label: string) {
  return { id, label, capabilities: [], max_output_tokens: 4096 };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupRoots();
});

describe('useAvailableModels', () => {
  it('keeps env-backed providers usable when no local credentials are stored', async () => {
    vi.mocked(getLocalProviderStatus).mockImplementation(async (providerId: string) => {
      const defaults = {
        configured: false,
        default_model: null,
        last_test_status: null,
        last_tested_at: null,
        last_test_error: null,
      };

      return {
        provider:
          providerId === 'anthropic' ? 'anthropic' : providerId === 'openai' ? 'openai' : 'google',
        ...defaults,
      } as never;
    });

    vi.mocked(getAvailableModels).mockResolvedValue({
      providers: [
        {
          name: 'anthropic',
          label: 'Anthropic',
          available: false,
          models: [makeModel('claude-sonnet-4-20250514', 'Claude Sonnet 4')],
        },
        {
          name: 'openai',
          label: 'OpenAI',
          available: true,
          models: [makeModel('gpt-4.1', 'GPT-4.1')],
        },
        {
          name: 'google',
          label: 'Google',
          available: false,
          models: [makeModel('gemini-2.5-pro', 'Gemini 2.5 Pro')],
        },
      ],
    } as never);

    const { result, unmount } = renderHook(() => useAvailableModels());
    expect(result.current.loading).toBe(true);

    await waitForHook();
    await waitForHook();

    expect(result.current.loading).toBe(false);
    expect(result.current.hasConfiguredGenerationProvider).toBe(true);
    expect(result.current.providers).toEqual([
      {
        name: 'openai',
        label: 'OpenAI',
        available: true,
        models: [makeModel('gpt-4.1', 'GPT-4.1')],
      },
    ]);
    expect(result.current.defaultProvider).toBe('openai');
    expect(result.current.defaultModel).toBe('gpt-4.1');

    const loaded = await result.current.loadModels();
    expect(loaded.providers).toEqual(result.current.providers);
    unmount();
  });

  it('prefers a usable local default provider and model when they are available', async () => {
    vi.mocked(getLocalProviderStatus).mockImplementation(async (providerId: string) => {
      if (providerId === 'anthropic') {
        return {
          provider: 'anthropic',
          configured: true,
          default_model: 'claude-sonnet-4-20250514',
          last_test_status: 'ok',
          last_tested_at: null,
          last_test_error: null,
        } as never;
      }

      return {
        provider: providerId === 'openai' ? 'openai' : 'google',
        configured: false,
        default_model: null,
        last_test_status: null,
        last_tested_at: null,
        last_test_error: null,
      } as never;
    });

    vi.mocked(getAvailableModels).mockResolvedValue({
      providers: [
        {
          name: 'anthropic',
          label: 'Anthropic',
          available: true,
          models: [
            makeModel('claude-sonnet-4-20250514', 'Claude Sonnet 4'),
            makeModel('claude-haiku-4-20250514', 'Claude Haiku 4'),
          ],
        },
        {
          name: 'openai',
          label: 'OpenAI',
          available: true,
          models: [makeModel('gpt-4.1', 'GPT-4.1')],
        },
      ],
    } as never);

    const { result, unmount } = renderHook(() => useAvailableModels());
    await waitForHook();
    await waitForHook();

    expect(result.current.providers.map((provider) => provider.name)).toEqual([
      'anthropic',
      'openai',
    ]);
    expect(result.current.defaultProvider).toBe('anthropic');
    expect(result.current.defaultModel).toBe('claude-sonnet-4-20250514');
    unmount();
  });

  it('fails closed when the model registry cannot be loaded', async () => {
    vi.mocked(getLocalProviderStatus).mockResolvedValue({
      provider: 'anthropic',
      configured: false,
      default_model: null,
      last_test_status: null,
      last_tested_at: null,
      last_test_error: null,
    } as never);
    vi.mocked(getAvailableModels).mockRejectedValue(new Error('boom'));

    const { result, unmount } = renderHook(() => useAvailableModels());
    await waitForHook();
    await waitForHook();

    expect(result.current.providers).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.hasConfiguredGenerationProvider).toBe(false);
    expect(result.current.defaultProvider).toBeNull();
    expect(result.current.defaultModel).toBeNull();
    unmount();
  });
});
