// @vitest-environment jsdom
//
// Polyfill localStorage for Zustand `persist` middleware (see
// settingsStore.test.ts for the rationale — Node 25 ships a broken stub).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { cleanupRoots, renderHook, waitForHook } from '../../hooks/renderHook';

vi.mock('@/hooks/shared/useAvailableModels', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/shared/useAvailableModels')>(
    '@/hooks/shared/useAvailableModels'
  );
  return {
    ...actual,
    useAvailableModels: vi.fn(),
  };
});

vi.mock('@/hooks/shared/useAuthMe', () => ({
  useAuthMe: vi.fn(),
}));

vi.mock('@/hooks/shared/useSession', () => ({
  useSession: vi.fn(),
}));

import { useAuthMe } from '@/hooks/shared/useAuthMe';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useSession } from '@/hooks/shared/useSession';
import { useChatModelPreferencesStore } from '@/store/chatModelPreferencesStore';

function makeModel(id: string, label: string) {
  return { id, label, capabilities: [], max_output_tokens: 4096 };
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
  useChatModelPreferencesStore.setState({
    selectedProvider: null,
    selectedModel: null,
    hydrated: true,
  });
  vi.mocked(useSession).mockReturnValue({
    getUser: vi.fn(),
    setUser: vi.fn(),
    getKey: vi.fn(() => null),
    setKey: vi.fn(),
    clear: vi.fn(),
  });
  vi.mocked(useAuthMe).mockReturnValue({
    loadAuthMe: vi.fn(),
    saveAuthMe: vi.fn(),
  });
});

afterEach(() => {
  cleanupRoots();
});

describe('useChatModelSelection', () => {
  it('restores the in-memory session selection when there is no route override', async () => {
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

  it('prefers the route selection over session state and saves it back', async () => {
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

  it('uses the authenticated user default when no route or session selection exists', async () => {
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
          models: [makeModel('gpt-5.4', 'GPT-5.4')],
        },
      ],
      loading: false,
      hasConfiguredGenerationProvider: true,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      loadModels: vi.fn(),
    });
    vi.mocked(useSession).mockReturnValue({
      getUser: vi.fn(),
      setUser: vi.fn(),
      getKey: vi.fn(() => 'session-key'),
      setKey: vi.fn(),
      clear: vi.fn(),
    });
    vi.mocked(useAuthMe).mockReturnValue({
      loadAuthMe: vi.fn().mockResolvedValue({
        id: 'user_1',
        name: 'Test',
        username: 'test',
        email: 'test@example.com',
        avatar_url: null,
        default_provider: 'openai',
        default_model: 'gpt-5.4',
      }),
      saveAuthMe: vi.fn(),
    });

    const { result, unmount } = renderHook(() => useChatModelSelection({}));

    await waitForHook();
    await waitForHook();

    expect(result.current.selectedProvider).toBe('openai');
    expect(result.current.selectedModel).toBe('gpt-5.4');
    expect(result.current.defaultProvider).toBe('openai');
    expect(result.current.defaultModel).toBe('gpt-5.4');
    unmount();
  });
});
