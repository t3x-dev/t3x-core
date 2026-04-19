// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from '../../hooks/renderHook';

vi.hoisted(() => {
  if (
    typeof globalThis.localStorage !== 'object' ||
    typeof globalThis.localStorage.setItem === 'function'
  ) {
    return;
  }
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
  });
});

vi.mock('@/hooks/shared/useAvailableModels', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/shared/useAvailableModels')>(
    '@/hooks/shared/useAvailableModels'
  );
  return {
    ...actual,
    useAvailableModels: vi.fn(),
  };
});

import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useChatModelPreferencesStore } from '@/store/chatModelPreferencesStore';

function makeModel(id: string, label: string) {
  return { id, label, capabilities: [], max_output_tokens: 4096 };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('t3x-chat-model-preferences');
  useChatModelPreferencesStore.setState({
    selectedProvider: null,
    selectedModel: null,
    hydrated: true,
  });
});

afterEach(() => {
  cleanupRoots();
});

describe('useChatModelSelection', () => {
  it('restores the persisted selection when there is no query override', async () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      providers: [
        {
          name: 'anthropic',
          label: 'Anthropic',
          available: true,
          models: [makeModel('claude-sonnet-4-20250514', 'Claude Sonnet 4')],
        },
        {
          name: 'openai',
          label: 'OpenAI',
          available: true,
          models: [makeModel('gpt-4.1', 'GPT-4.1')],
        },
      ],
      loading: false,
      hasConfiguredGenerationProvider: true,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      loadModels: vi.fn(),
    });
    useChatModelPreferencesStore.setState({
      selectedProvider: 'openai',
      selectedModel: 'gpt-4.1',
      hydrated: true,
    });

    const { result, unmount } = renderHook(() => useChatModelSelection({}));

    await waitForHook();

    expect(result.current.selectedProvider).toBe('openai');
    expect(result.current.selectedModel).toBe('gpt-4.1');
    expect(result.current.isSelectionReady).toBe(true);
    unmount();
  });

  it('prefers the route selection over persisted state and saves it back', async () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      providers: [
        {
          name: 'anthropic',
          label: 'Anthropic',
          available: true,
          models: [makeModel('claude-sonnet-4-20250514', 'Claude Sonnet 4')],
        },
        {
          name: 'openai',
          label: 'OpenAI',
          available: true,
          models: [makeModel('gpt-4.1', 'GPT-4.1')],
        },
      ],
      loading: false,
      hasConfiguredGenerationProvider: true,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      loadModels: vi.fn(),
    });
    useChatModelPreferencesStore.setState({
      selectedProvider: 'openai',
      selectedModel: 'gpt-4.1',
      hydrated: true,
    });

    const { result, unmount } = renderHook(() =>
      useChatModelSelection({
        initialProvider: 'anthropic',
        initialModel: 'claude-sonnet-4-20250514',
      })
    );

    await waitForHook();

    expect(result.current.selectedProvider).toBe('anthropic');
    expect(result.current.selectedModel).toBe('claude-sonnet-4-20250514');
    expect(useChatModelPreferencesStore.getState().selectedProvider).toBe('anthropic');
    expect(useChatModelPreferencesStore.getState().selectedModel).toBe('claude-sonnet-4-20250514');
    unmount();
  });
});
