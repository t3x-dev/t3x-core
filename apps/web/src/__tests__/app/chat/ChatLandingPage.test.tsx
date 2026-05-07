// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const push = vi.fn();
let searchParamsValue: URLSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
  useSearchParams: () => searchParamsValue,
}));

vi.mock('@/hooks/shared/useAvailableModels', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/shared/useAvailableModels')>(
    '@/hooks/shared/useAvailableModels'
  );
  return {
    ...actual,
    useAvailableModels: vi.fn(),
  };
});

vi.mock('@/components/chat/ChatInput', () => ({
  ChatInput: ({
    disabled,
    selectedModel,
    onSend,
    onModelChange,
  }: {
    disabled?: boolean;
    selectedModel?: string;
    onSend: (message: string) => void;
    onModelChange?: (provider: string, model: string) => void;
  }) => (
    <div>
      <div data-testid="chat-disabled">{String(Boolean(disabled))}</div>
      <div data-testid="selected-model">{selectedModel ?? ''}</div>
      <button type="button" onClick={() => onModelChange?.('openai', 'gpt-4.1')}>
        select openai
      </button>
      <button type="button" onClick={() => onSend('hello world')}>
        send chat
      </button>
    </div>
  ),
}));

import ChatLandingPage from '@/app/chat/page';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import { useChatModelPreferencesStore } from '@/store/chatModelPreferencesStore';
import { useChatStore } from '@/store/chatStore';

beforeEach(() => {
  localStorage.removeItem('t3x-chat-model-preferences');
  useChatModelPreferencesStore.setState({
    selectedProvider: null,
    selectedModel: null,
    hydrated: true,
  });
  useChatStore.setState({ activeProjectId: null, activeConversationId: null });
  searchParamsValue = new URLSearchParams();
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('t3x-chat-model-preferences');
  useChatModelPreferencesStore.setState({
    selectedProvider: null,
    selectedModel: null,
    hydrated: true,
  });
  useChatStore.setState({ activeProjectId: null, activeConversationId: null });
  searchParamsValue = new URLSearchParams();
});

describe('ChatLandingPage', () => {
  it('preserves provider and model in the /chat/new navigation URL', async () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      providers: [
        {
          name: 'anthropic',
          label: 'Anthropic',
          available: true,
          models: [
            {
              id: 'claude-sonnet-4-20250514',
              label: 'Claude Sonnet 4',
              capabilities: [],
              max_output_tokens: 4096,
            },
          ],
        },
        {
          name: 'openai',
          label: 'OpenAI',
          available: true,
          models: [{ id: 'gpt-4.1', label: 'GPT-4.1', capabilities: [], max_output_tokens: 4096 }],
        },
      ],
      loading: false,
      hasConfiguredGenerationProvider: true,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      availabilityError: null,
      loadModels: vi.fn(),
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('selected-model')).toHaveTextContent('claude-sonnet-4-20250514');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select openai/i }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('selected-model')).toHaveTextContent('gpt-4.1');
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    });

    expect(push).toHaveBeenCalledWith(
      '/chat/new?firstMessage=hello+world&provider=openai&model=gpt-4.1'
    );
  });

  it('primes activeProjectId and propagates ?projectId= into /chat/new', async () => {
    // Mirrors the "+ New Project" sidebar action, which lands here with
    // ?projectId=<id>. Without propagation, ChatWorkspace.useAutoProject
    // would create a second project on first send.
    searchParamsValue = new URLSearchParams({ projectId: 'proj_from_url' });

    vi.mocked(useAvailableModels).mockReturnValue({
      providers: [
        {
          name: 'anthropic',
          label: 'Anthropic',
          available: true,
          models: [
            {
              id: 'claude-sonnet-4-20250514',
              label: 'Claude Sonnet 4',
              capabilities: [],
              max_output_tokens: 4096,
            },
          ],
        },
      ],
      loading: false,
      hasConfiguredGenerationProvider: true,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      availabilityError: null,
      loadModels: vi.fn(),
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    await waitFor(() => {
      expect(useChatStore.getState().activeProjectId).toBe('proj_from_url');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    });

    expect(push).toHaveBeenCalledTimes(1);
    const target = (push.mock.calls[0]?.[0] as string) ?? '';
    expect(target.startsWith('/chat/new?')).toBe(true);
    const params = new URLSearchParams(target.slice('/chat/new?'.length));
    expect(params.get('firstMessage')).toBe('hello world');
    expect(params.get('projectId')).toBe('proj_from_url');
  });

  it('disables the start path when no generation provider is usable', async () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      providers: [],
      loading: false,
      hasConfiguredGenerationProvider: false,
      defaultProvider: null,
      defaultModel: null,
      availabilityError: null,
      loadModels: vi.fn(),
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(screen.getByText('Set up a generation provider')).toBeInTheDocument();
    expect(screen.getByTestId('chat-disabled')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: /capture meeting notes/i })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('shows an API unavailable banner instead of provider setup when model loading fails', async () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      providers: [],
      loading: false,
      hasConfiguredGenerationProvider: false,
      defaultProvider: null,
      defaultModel: null,
      availabilityError: 'api_unavailable',
      loadModels: vi.fn(),
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(screen.getByText('API server unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Set up a generation provider')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-disabled')).toHaveTextContent('true');
  });
});
