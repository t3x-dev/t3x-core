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

const modelSelectionFixture = vi.hoisted(() => ({
  value: {
    loading: false,
    hasConfiguredGenerationProvider: true,
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet-4-20250514',
    availabilityError: null as 'api_unavailable' | null,
  },
}));

vi.mock('@/hooks/shared/useChatModelSelection', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    useChatModelSelection: vi.fn(() => {
      const [selection, setSelection] = React.useState({
        provider: modelSelectionFixture.value.selectedProvider,
        model: modelSelectionFixture.value.selectedModel,
      });
      return {
        loading: modelSelectionFixture.value.loading,
        hasConfiguredGenerationProvider:
          modelSelectionFixture.value.hasConfiguredGenerationProvider,
        selectedProvider: selection.provider,
        selectedModel: selection.model,
        handleModelChange: (provider: string, model: string) => {
          modelSelectionFixture.value.selectedProvider = provider;
          modelSelectionFixture.value.selectedModel = model;
          setSelection({ provider, model });
        },
        availabilityError: modelSelectionFixture.value.availabilityError,
      };
    }),
  };
});

vi.mock('@/components/chat/ChatInput', () => ({
  ChatInput: ({
    disabled,
    placeholder,
    selectedModel,
    onSend,
    onModelChange,
  }: {
    disabled?: boolean;
    placeholder?: string;
    selectedModel?: string;
    onSend: (message: string) => void;
    onModelChange?: (provider: string, model: string) => void;
  }) => (
    <div>
      <div data-testid="chat-disabled">{String(Boolean(disabled))}</div>
      <div data-testid="chat-placeholder">{placeholder ?? ''}</div>
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
import { useChatStore } from '@/store/chatStore';

function setModelSelection(overrides: Partial<typeof modelSelectionFixture.value> = {}): void {
  modelSelectionFixture.value = {
    loading: false,
    hasConfiguredGenerationProvider: true,
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet-4-20250514',
    availabilityError: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.removeItem('t3x-chat-model-preferences');
  setModelSelection();
  useChatStore.setState({ activeProjectId: null, activeConversationId: null });
  searchParamsValue = new URLSearchParams();
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('t3x-chat-model-preferences');
  setModelSelection();
  useChatStore.setState({ activeProjectId: null, activeConversationId: null });
  searchParamsValue = new URLSearchParams();
});

describe('ChatLandingPage', () => {
  it('renders the guided landing copy and starter actions', async () => {
    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(screen.getByRole('heading', { name: 'What should T3X make sense of?' })).toBeVisible();
    expect(screen.getByText('Source')).toBeVisible();
    expect(screen.getByText('Meaning')).toBeVisible();
    expect(screen.getByText('Commit')).toBeVisible();
    expect(screen.getByRole('button', { name: /capture source/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /shape meaning/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /create checkpoint/i })).toBeEnabled();
    expect(screen.getByTestId('chat-placeholder')).toHaveTextContent(
      'Paste notes, ask a question, or describe what to preserve...'
    );
  });

  it('preserves provider and model in the /chat/new navigation URL', async () => {
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
    setModelSelection({
      hasConfiguredGenerationProvider: false,
      selectedProvider: null,
      selectedModel: null,
      availabilityError: null,
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(screen.getByText('Set up a generation provider')).toBeInTheDocument();
    expect(screen.getByTestId('chat-disabled')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: /capture source/i })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('shows an API unavailable banner instead of provider setup when model loading fails', async () => {
    setModelSelection({
      hasConfiguredGenerationProvider: false,
      selectedProvider: null,
      selectedModel: null,
      availabilityError: 'api_unavailable',
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(screen.getByText('API server unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Set up a generation provider')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-disabled')).toHaveTextContent('true');
  });
});
